import { ChangeDetectionStrategy, Component, inject, input, effect, signal, untracked, DestroyRef } from '@angular/core';
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
import { Team } from '../../core/models/team.model';
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
  host: { 'data-accent': 'purple' },
})
export class Game {
  readonly store = inject(GameStore);
  readonly route = inject(ActivatedRoute);
  private router = inject(Router);
  private deckService = inject(DeckService);
  private crestTextRegions = inject(CrestTextRegionService);
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
      // Kick off detection for every badge in the whole round as soon as
      // it's loaded, not just the current question's — OCR takes a couple
      // of seconds per crest, so waiting until a question is on screen to
      // start it would flash the un-masked name for however long that
      // takes. Whether a badge is visible before its detection finishes is
      // still handled by textRegionsFor()/crestReadyFor() gating the image.
      const questions = this.store.questions();
      const teams = new Map<string, Team>();
      for (const question of questions) {
        teams.set(question.correctTeam.id, question.correctTeam);
        for (const option of question.options) teams.set(option.id, option);
      }
      for (const team of teams.values()) {
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

  // A team's crest must stay hidden until we know whether it needs masking —
  // an empty result and "not checked yet" both read as "no boxes to draw",
  // so without this the badge would render un-masked for however long OCR
  // takes on a never-before-seen team.
  crestReadyFor(teamId: string): boolean {
    return this.textRegionsByTeamId().has(teamId);
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
