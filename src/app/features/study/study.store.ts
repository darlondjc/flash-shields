import { Injectable, inject, signal, computed } from '@angular/core';
import { SrsService } from '../../core/srs/srs.service';
import { SessionService } from '../../core/session/session.service';
import { Team } from '../../core/models/team.model';
import { ReviewGrade } from '../../core/models/review-state.model';
import { SessionAnswer } from '../../core/models/session.model';

const RELEARN_INSERT_OFFSET = 3;

@Injectable({ providedIn: 'root' })
export class StudyStore {
  private srs = inject(SrsService);
  private sessionService = inject(SessionService);

  readonly deckId = signal<string | null>(null);
  readonly queue = signal<Team[]>([]);
  readonly total = signal(0);
  readonly current = computed(() => this.queue()[0] ?? null);
  readonly remaining = computed(() => this.queue().length);
  readonly revealed = signal(false);

  private answers = signal<SessionAnswer[]>([]);
  private startedAt = signal<string | null>(null);
  private revealedAt = 0;

  async load(deckId: string) {
    this.deckId.set(deckId);
    const queue = await this.srs.buildDailyQueue(deckId);
    this.queue.set(queue);
    this.total.set(queue.length);
    this.revealed.set(false);
    this.answers.set([]);
    this.startedAt.set(new Date().toISOString());
  }

  reveal() {
    this.revealed.set(true);
    this.revealedAt = Date.now();
  }

  async grade(grade: ReviewGrade) {
    const team = this.current();
    if (!team) return;

    const responseMs = Date.now() - this.revealedAt;
    const resultLevel = await this.srs.grade(this.deckId()!, team.id, grade);

    this.answers.update(list => [
      ...list,
      { teamId: team.id, correct: grade !== 'errei', responseMs, answeredAt: new Date().toISOString() },
    ]);

    this.queue.update(q => {
      const rest = q.slice(1);
      // Level-based, not grade-based: a `dificil` grade keeps an already-level-0
      // card at level 0, so it must still be reinserted here even though it's
      // recorded as `correct: true` in the answer above.
      if (resultLevel > 0) return rest;
      const insertAt = Math.min(rest.length, RELEARN_INSERT_OFFSET);
      return [...rest.slice(0, insertAt), team, ...rest.slice(insertAt)];
    });
    this.revealed.set(false);

    if (this.queue().length === 0) {
      await this.finishSession();
    }
  }

  private async finishSession() {
    const deckId = this.deckId();
    const startedAt = this.startedAt();
    if (!deckId || !startedAt) return;
    try {
      await this.sessionService.finish(deckId, 'study', this.answers(), startedAt);
    } catch (err) {
      console.error(`StudyStore: failed to save session for deck ${deckId}`, err);
    }
  }
}
