import { ChangeDetectionStrategy, Component, computed, inject, input, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { StudyStore } from './study.store';
import { TeamBadge } from '../../shared/ui/team-badge';

@Component({
  selector: 'app-study',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TeamBadge, HugeiconsIconComponent],
  templateUrl: './study.html',
  styleUrl: './study.scss',
})
export class Study {
  readonly store = inject(StudyStore);
  readonly deckId = input.required<string>();

  readonly ArrowLeft01Icon = ArrowLeft01Icon;

  readonly progressPercent = computed(() => {
    const total = this.store.total();
    if (total === 0) return 0;
    return ((total - this.store.remaining()) / total) * 100;
  });

  constructor() {
    effect(() => {
      this.store.load(this.deckId());
    });
  }
}
