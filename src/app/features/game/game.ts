import { ChangeDetectionStrategy, Component, inject, input, effect, DestroyRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { ArrowLeft01Icon, FireIcon } from '@hugeicons/core-free-icons';
import { map } from 'rxjs/operators';
import { GameMode } from '../../core/models/session.model';
import { GameStore } from './game.store';
import { Question } from './game.util';
import { TeamBadge } from '../../shared/ui/team-badge';

const AUTO_ADVANCE_DELAY_MS = 1200;

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TeamBadge, HugeiconsIconComponent],
  templateUrl: './game.html',
  styleUrl: './game.scss',
})
export class Game {
  readonly store = inject(GameStore);
  readonly route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly deckId = input.required<string>();

  readonly ArrowLeft01Icon = ArrowLeft01Icon;
  readonly FireIcon = FireIcon;
  readonly autoAdvanceDelayMs = AUTO_ADVANCE_DELAY_MS;

  private mode = toSignal(
    this.route.queryParams.pipe(map(params => (params['mode'] as GameMode) ?? 'multiple-choice')),
    { initialValue: 'multiple-choice' as GameMode },
  );

  private readonly returnLeagueId = this.route.snapshot.queryParamMap.get('league');
  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const deckId = this.deckId();
      const mode = this.mode();
      if (deckId) {
        this.store.load(deckId, mode);
      }
    });

    effect(() => {
      const selected = this.store.selectedTeamId();
      this.clearAutoAdvance();
      if (selected) {
        this.autoAdvanceTimer = setTimeout(() => {
          this.autoAdvanceTimer = null;
          this.store.next();
        }, AUTO_ADVANCE_DELAY_MS);
      }
    });

    inject(DestroyRef).onDestroy(() => this.clearAutoAdvance());
  }

  private clearAutoAdvance() {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  back() {
    const sessionInProgress = this.store.total() > 0 && !this.store.finished();
    if (sessionInProgress && !confirm('Sair do jogo? A pontuação desta partida será perdida.')) {
      return;
    }
    this.router.navigate(['/'], { queryParams: this.returnLeagueId ? { league: this.returnLeagueId } : {} });
  }

  optionState(optionId: string, correctTeamId: string): 'correct' | 'incorrect' | 'neutral' {
    const selected = this.store.selectedTeamId();
    if (!selected) return 'neutral';
    if (optionId === correctTeamId) return 'correct';
    if (optionId === selected) return 'incorrect';
    return 'neutral';
  }

  onBadgeLoadFailed(question: Question, teamId: string) {
    this.store.handleBadgeLoadFailure(question, teamId);
  }
}
