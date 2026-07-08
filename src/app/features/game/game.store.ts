import { Injectable, inject, signal, computed } from '@angular/core';
import { DeckService } from '../../core/decks/deck.service';
import { DbService } from '../../core/persistence/db.service';
import { SessionService } from '../../core/session/session.service';
import { GameMode } from '../../core/models/session.model';
import { Team } from '../../core/models/team.model';
import { SessionAnswer } from '../../core/models/session.model';
import { buildMultipleChoiceQuestions, buildReverseQuestions, MultipleChoiceQuestion, ReverseQuestion } from './game.util';

const DEFAULT_ROUND_SIZE = 10;

type Question = MultipleChoiceQuestion | ReverseQuestion;

@Injectable({ providedIn: 'root' })
export class GameStore {
  private deckService = inject(DeckService);
  private db = inject(DbService);
  private sessionService = inject(SessionService);

  private deckId: string | null = null;
  private gameModeSignal = signal<GameMode>('multiple-choice');
  private questionShownAt = 0;

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
    if (!deck) return;

    const teams = (await this.db.teams.bulkGet(deck.teamIds)).filter((t): t is Team => !!t);
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
