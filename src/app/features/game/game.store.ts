import { Injectable, inject, signal, computed } from '@angular/core';
import { DeckService } from '../../core/decks/deck.service';
import { DbService } from '../../core/persistence/db.service';
import { Team } from '../../core/models/team.model';
import { buildMultipleChoiceQuestions, MultipleChoiceQuestion } from './game.util';

const DEFAULT_ROUND_SIZE = 10;

@Injectable({ providedIn: 'root' })
export class GameStore {
  private deckService = inject(DeckService);
  private db = inject(DbService);

  readonly questions = signal<MultipleChoiceQuestion[]>([]);
  readonly index = signal(0);
  readonly score = signal(0);
  readonly streak = signal(0);
  readonly bestStreak = signal(0);
  readonly selectedTeamId = signal<string | null>(null);

  readonly current = computed(() => this.questions()[this.index()] ?? null);
  readonly finished = computed(
    () => this.questions().length > 0 && this.index() >= this.questions().length,
  );

  async load(deckId: string, roundSize: number = DEFAULT_ROUND_SIZE) {
    const deck = await this.deckService.getDeck(deckId);
    this.questions.set([]);
    this.index.set(0);
    this.score.set(0);
    this.streak.set(0);
    this.bestStreak.set(0);
    this.selectedTeamId.set(null);
    if (!deck) return;

    const teams = (await this.db.teams.bulkGet(deck.teamIds)).filter((t): t is Team => !!t);
    this.questions.set(buildMultipleChoiceQuestions(teams, roundSize));
  }

  select(teamId: string) {
    const question = this.current();
    if (!question || this.selectedTeamId()) return;
    this.selectedTeamId.set(teamId);

    if (teamId === question.correctTeam.id) {
      this.score.update(s => s + 1);
      this.streak.update(s => s + 1);
      this.bestStreak.update(b => Math.max(b, this.streak()));
    } else {
      this.streak.set(0);
    }
  }

  next() {
    this.index.update(i => i + 1);
    this.selectedTeamId.set(null);
  }
}
