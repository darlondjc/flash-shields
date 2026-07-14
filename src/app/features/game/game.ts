import { ChangeDetectionStrategy, Component, inject, input, effect, DestroyRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import ArrowLeft02Icon from '@hugeicons/core-free-icons/ArrowLeft02Icon';
import FireIcon from '@hugeicons/core-free-icons/FireIcon';
import { map } from 'rxjs/operators';
import { GameMode } from '../../core/models/session.model';
import { DeckService } from '../../core/decks/deck.service';
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
  host: { 'data-accent': 'purple' },
})
export class Game {
  readonly store = inject(GameStore);
  readonly route = inject(ActivatedRoute);
  private router = inject(Router);
  private deckService = inject(DeckService);
  readonly deckId = input.required<string>();

  readonly Home01Icon = Home01Icon;
  readonly ArrowLeft02Icon = ArrowLeft02Icon;
  readonly FireIcon = FireIcon;
  readonly autoAdvanceDelayMs = AUTO_ADVANCE_DELAY_MS;

  private mode = toSignal(
    this.route.queryParams.pipe(map(params => (params['mode'] as GameMode) ?? 'multiple-choice')),
    { initialValue: 'multiple-choice' as GameMode },
  );

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
    if (!this.confirmLeave()) return;
    this.router.navigate(['/']);
  }

  async backToLeague() {
    if (!this.confirmLeave()) return;
    // Deck ids for league decks carry the league's external id
    // (scope.leagueId = 'ts-<externalId>'), which is exactly what the picker
    // reads back from ?league= to restore the selection.
    const deck = await this.deckService.getDeck(this.deckId());
    const leagueId = deck?.scope.kind === 'league' ? deck.scope.leagueId : null;
    const externalId = leagueId?.startsWith('ts-') ? leagueId.slice(3) : null;
    this.router.navigate(['/jogos'], externalId ? { queryParams: { league: externalId } } : {});
  }

  private confirmLeave(): boolean {
    const sessionInProgress = this.store.total() > 0 && !this.store.finished();
    return !sessionInProgress || confirm('Sair do jogo? A pontuação desta partida será perdida.');
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
