import { Injectable, inject, signal, computed } from '@angular/core';
import { DeckService } from '../../core/decks/deck.service';
import { DbService } from '../../core/persistence/db.service';
import { SessionService } from '../../core/session/session.service';
import { GameMode } from '../../core/models/session.model';
import { Team } from '../../core/models/team.model';
import { SessionAnswer } from '../../core/models/session.model';
import { buildMultipleChoiceQuestions, buildReverseQuestions, Question } from './game.util';
import { pickRandom, shuffle } from '../../core/util/random.util';

const DEFAULT_ROUND_SIZE = 10;

@Injectable({ providedIn: 'root' })
export class GameStore {
  private deckService = inject(DeckService);
  private db = inject(DbService);
  private sessionService = inject(SessionService);

  private deckId: string | null = null;
  private gameModeSignal = signal<GameMode>('multiple-choice');
  private questionShownAt = 0;
  private allTeams: Team[] = [];
  // Teams whose badge failed to load this session — excluded when picking a
  // replacement so a broken badge doesn't just get swapped for another broken one.
  private failedTeamIds = new Set<string>();

  readonly questions = signal<Question[]>([]);
  readonly index = signal(0);
  readonly score = signal(0);
  readonly streak = signal(0);
  readonly bestStreak = signal(0);
  readonly selectedTeamId = signal<string | null>(null);
  readonly answers = signal<SessionAnswer[]>([]);
  readonly startedAt = signal<string | null>(null);

  readonly current = computed(() => this.questions()[this.index()] ?? null);
  readonly total = computed(() => this.questions().length);
  readonly finished = computed(
    () => this.questions().length > 0 && this.index() >= this.questions().length,
  );
  readonly mode = computed(() => this.gameModeSignal());

  async load(deckId: string, mode: GameMode = 'multiple-choice', roundSize: number = DEFAULT_ROUND_SIZE) {
    const deck = await this.deckService.getDeck(deckId);
    this.deckId = deckId;
    this.gameModeSignal.set(mode);
    this.questions.set([]);
    this.index.set(0);
    this.score.set(0);
    this.streak.set(0);
    this.bestStreak.set(0);
    this.selectedTeamId.set(null);
    this.answers.set([]);
    this.startedAt.set(new Date().toISOString());
    this.allTeams = [];
    this.failedTeamIds.clear();
    if (!deck) return;

    const teams = (await this.db.teams.bulkGet(deck.teamIds)).filter((t): t is Team => !!t);
    this.allTeams = teams;
    const questions = mode === 'reverse'
      ? buildReverseQuestions(teams, roundSize)
      : buildMultipleChoiceQuestions(teams, roundSize);
    this.questions.set(questions);
    this.questionShownAt = Date.now();
  }

  select(teamId: string) {
    const question = this.current();
    if (!question || this.selectedTeamId()) return;
    this.selectedTeamId.set(teamId);

    const correct = teamId === question.correctTeam.id;
    this.answers.update(list => [
      ...list,
      {
        // The tested/prompted team, not the team the user clicked; see `correct` for that.
        teamId: question.correctTeam.id,
        correct,
        responseMs: Date.now() - this.questionShownAt,
        answeredAt: new Date().toISOString(),
      },
    ]);

    if (correct) {
      this.score.update(s => s + 1);
      this.streak.update(s => s + 1);
      this.bestStreak.update(b => Math.max(b, this.streak()));
    } else {
      this.streak.set(0);
    }
  }

  async next() {
    if (this.finished()) return;

    this.index.update(i => i + 1);
    this.selectedTeamId.set(null);

    if (this.finished()) {
      await this.recordSession();
    } else {
      this.questionShownAt = Date.now();
    }
  }

  // Called when a badge in the current question fails to load after retries.
  // Swaps the broken team for a fresh one so the round can keep going instead
  // of leaving a permanently broken image on screen.
  handleBadgeLoadFailure(question: Question, teamId: string) {
    if (this.current() !== question || this.selectedTeamId()) return;
    this.failedTeamIds.add(teamId);

    if (teamId === question.correctTeam.id) {
      this.replaceCurrentQuestion(question);
    } else {
      this.replaceOption(question, teamId);
    }
  }

  private replaceOption(question: Question, failedTeamId: string) {
    // Exclude every team already showing in this question too, not just other
    // questions — otherwise the replacement could duplicate a sibling option.
    const excluded = new Set([
      ...this.usedTeamIds(question),
      ...this.failedTeamIds,
      question.correctTeam.id,
      ...question.options.map(option => option.id),
    ]);
    const replacement = this.pickReplacementTeam(excluded);
    if (!replacement) return;

    const options = question.options.map(option => (option.id === failedTeamId ? replacement : option));
    this.replaceCurrentWith({ ...question, options: shuffle(options) });
  }

  private replaceCurrentQuestion(question: Question) {
    const excluded = new Set([...this.usedTeamIds(question), ...this.failedTeamIds]);
    const pool = this.allTeams.filter(team => !excluded.has(team.id));
    const source = pool.length > 0 ? pool : this.allTeams.filter(team => !this.failedTeamIds.has(team.id));
    const [replacement] = this.mode() === 'reverse'
      ? buildReverseQuestions(source, 1)
      : buildMultipleChoiceQuestions(source, 1);
    if (!replacement) return;

    this.replaceCurrentWith(replacement);
  }

  private replaceCurrentWith(question: Question) {
    const index = this.index();
    this.questions.update(questions => questions.map((q, i) => (i === index ? question : q)));
  }

  private pickReplacementTeam(excluded: Set<string>): Team | undefined {
    const pool = this.allTeams.filter(team => !excluded.has(team.id));
    const source = pool.length > 0 ? pool : this.allTeams.filter(team => !this.failedTeamIds.has(team.id));
    return pickRandom(source, 1)[0];
  }

  private usedTeamIds(excluding: Question): Set<string> {
    const ids = new Set<string>();
    for (const question of this.questions()) {
      if (question === excluding) continue;
      ids.add(question.correctTeam.id);
      for (const option of question.options) ids.add(option.id);
    }
    return ids;
  }

  private async recordSession() {
    const startedAt = this.startedAt();
    if (!this.deckId || !startedAt) return;
    try {
      await this.sessionService.finish(this.deckId, this.gameModeSignal(), this.answers(), startedAt);
    } catch (err) {
      console.error(`GameStore: failed to save session for deck ${this.deckId}`, err);
    }
  }
}
