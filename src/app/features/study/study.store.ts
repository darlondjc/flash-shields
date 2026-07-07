import { Injectable, inject, signal, computed } from '@angular/core';
import { SrsService } from '../../core/srs/srs.service';
import { Team } from '../../core/models/team.model';
import { ReviewQuality } from '../../core/models/review-state.model';

@Injectable({ providedIn: 'root' })
export class StudyStore {
  private srs = inject(SrsService);

  readonly deckId = signal<string | null>(null);
  readonly queue = signal<Team[]>([]);
  readonly current = computed(() => this.queue()[0] ?? null);
  readonly remaining = computed(() => this.queue().length);
  readonly revealed = signal(false);

  async load(deckId: string) {
    this.deckId.set(deckId);
    this.queue.set(await this.srs.buildDailyQueue(deckId));
    this.revealed.set(false);
  }

  reveal() {
    this.revealed.set(true);
  }

  async grade(quality: ReviewQuality) {
    const team = this.current();
    if (!team) return;
    await this.srs.grade(this.deckId()!, team.id, quality);
    this.queue.update(q => q.slice(1));
    this.revealed.set(false);
  }
}
