import { ChangeDetectionStrategy, Component, inject, PendingTasks } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import { StatsStore } from './stats.store';
import { GameMode } from '../../core/models/session.model';
import { LeagueBadge } from '../../shared/ui/league-badge';

@Component({
  selector: 'app-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HugeiconsIconComponent, LeagueBadge],
  templateUrl: './stats.html',
  styleUrl: './stats.scss',
  host: { 'data-accent': 'blue' },
})
export class Stats {
  readonly store = inject(StatsStore);
  private readonly pendingTasks = inject(PendingTasks);

  readonly Home01Icon = Home01Icon;

  constructor() {
    // Runs load() inside a PendingTasks block so Angular's zoneless stability
    // tracking (and therefore ComponentFixture.whenStable() in tests) waits
    // for the underlying IndexedDB round-trips to finish, not just one tick.
    this.pendingTasks.run(async () => {
      try {
        await this.store.load();
      } catch (err) {
        console.error('Stats: failed to load session stats', err);
      }
    });
  }

  formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  formatDate(iso: string): string {
    // Reads the day/month straight off the ISO string's UTC date portion instead of
    // going through `Date`'s local-timezone conversion, so this stays consistent with
    // the heatmap in StatsStore (which also buckets by the UTC date substring).
    const [, month, day] = iso.slice(0, 10).split('-');
    return `${day}/${month}`;
  }

  heatmapLevel(count: number): number {
    if (count === 0) return 0;
    if (count < 5) return 1;
    if (count < 10) return 2;
    if (count < 20) return 3;
    return 4;
  }

  modeLabel(mode: GameMode): string {
    switch (mode) {
      case 'multiple-choice':
        return 'Múltipla escolha';
      case 'reverse':
        return 'Reverso';
      case 'study':
        return 'Estudo';
    }
  }
}
