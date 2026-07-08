import { ChangeDetectionStrategy, Component, inject, input, effect } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { ArrowLeft01Icon, FireIcon } from '@hugeicons/core-free-icons';
import { map } from 'rxjs/operators';
import { GameMode } from '../../core/models/session.model';
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
  readonly route = inject(ActivatedRoute);
  readonly deckId = input.required<string>();

  readonly ArrowLeft01Icon = ArrowLeft01Icon;
  readonly FireIcon = FireIcon;

  private mode = toSignal(
    this.route.queryParams.pipe(map(params => (params['mode'] as GameMode) ?? 'multiple-choice')),
    { initialValue: 'multiple-choice' as GameMode },
  );

  constructor() {
    effect(() => {
      this.store.load(this.deckId(), this.mode());
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
