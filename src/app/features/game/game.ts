import { ChangeDetectionStrategy, Component, inject, input, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameStore } from './game.store';
import { TeamBadge } from '../../shared/ui/team-badge';

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TeamBadge],
  templateUrl: './game.html',
})
export class Game {
  readonly store = inject(GameStore);
  readonly deckId = input.required<string>();

  constructor() {
    effect(() => {
      this.store.load(this.deckId());
    });
  }
}
