import { ChangeDetectionStrategy, Component, inject, input, effect, signal, untracked, DestroyRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import FireIcon from '@hugeicons/core-free-icons/FireIcon';
import { map } from 'rxjs/operators';
import { GameMode } from '../../core/models/session.model';
import { GameStore } from './game.store';
import { Question } from './game.util';
import { TeamBadge } from '../../shared/ui/team-badge';
import { CrestTextRegionService } from '../../core/persistence/crest-text-region.service';
import { CrestTextBox } from '../../core/models/crest-text-box.model';

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
  private crestTextRegions = inject(CrestTextRegionService);
  readonly deckId = input.required<string>();

  readonly Home01Icon = Home01Icon;
  readonly FireIcon = FireIcon;
  readonly autoAdvanceDelayMs = AUTO_ADVANCE_DELAY_MS;

  private mode = toSignal(
    this.route.queryParams.pipe(map(params => (params['mode'] as GameMode) ?? 'multiple-choice')),
    { initialValue: 'multiple-choice' as GameMode },
  );

  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly textRegionsByTeamId = signal<Map<string, CrestTextBox[]>>(new Map());

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

    effect(() => {
      const question = this.store.current();
      if (!question) return;

      // Every badge that's actually visible needs its name masked: just the
      // prompt in multiple-choice mode (the answer is picked from text
      // options), but every option's shield in reverse mode — an unmasked
      // name baked into any of those crests would let the user read the
      // answer off the artwork instead of recognizing the shield.
      const teams = this.store.mode() === 'reverse' ? question.options : [question.correctTeam];
      for (const team of teams) {
        if (untracked(() => this.textRegionsByTeamId().has(team.id))) continue;
        this.crestTextRegions.getRegions(team).then(boxes => {
          this.textRegionsByTeamId.update(map => new Map(map).set(team.id, boxes));
        });
      }
    });

    inject(DestroyRef).onDestroy(() => this.clearAutoAdvance());
  }

  textRegionsFor(teamId: string): CrestTextBox[] {
    return this.textRegionsByTeamId().get(teamId) ?? [];
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
    this.router.navigate(['/']);
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
