import { ChangeDetectionStrategy, Component, inject, input, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StudyStore } from './study.store';
import { TeamBadge } from '../../shared/ui/team-badge';

@Component({
  selector: 'app-study',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TeamBadge],
  templateUrl: './study.html',
})
export class Study {
  readonly store = inject(StudyStore);
  readonly deckId = input.required<string>();

  constructor() {
    effect(() => {
      this.store.load(this.deckId());
    });
  }
}
