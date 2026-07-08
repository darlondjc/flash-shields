import { ChangeDetectionStrategy, Component, inject, input, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { ArrowLeft01Icon, FireIcon } from '@hugeicons/core-free-icons';
import { GameStore } from './game.store';
import { TeamBadge } from '../../shared/ui/team-badge';

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TeamBadge, HugeiconsIconComponent],
  templateUrl: './game.html',
  styleUrl: './game.scss',
})
export class Game {
  readonly store = inject(GameStore);
  readonly deckId = input.required<string>();

  readonly ArrowLeft01Icon = ArrowLeft01Icon;
  readonly FireIcon = FireIcon;

  constructor() {
    effect(() => {
      this.store.load(this.deckId());
    });
  }

  optionState(optionId: string, correctTeamId: string): 'correct' | 'incorrect' | 'neutral' {
    const selected = this.store.selectedTeamId();
    if (!selected) return 'neutral';
    if (optionId === correctTeamId) return 'correct';
    if (optionId === selected) return 'incorrect';
    return 'neutral';
  }
}
