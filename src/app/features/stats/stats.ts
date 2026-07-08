import { ChangeDetectionStrategy, Component, inject, PendingTasks } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatsStore } from './stats.store';

@Component({
  selector: 'app-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './stats.html',
  styleUrl: './stats.scss',
})
export class Stats {
  readonly store = inject(StatsStore);
  private readonly pendingTasks = inject(PendingTasks);

  constructor() {
    // Runs load() inside a PendingTasks block so Angular's zoneless stability
    // tracking (and therefore ComponentFixture.whenStable() in tests) waits
    // for the underlying IndexedDB round-trips to finish, not just one tick.
    this.pendingTasks.run(() => this.store.load());
  }

  formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  modeLabel(mode: string): string {
    return mode === 'multiple-choice' ? 'Múltipla escolha' : mode;
  }
}
