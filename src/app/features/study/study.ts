import { ChangeDetectionStrategy, Component, computed, inject, input, effect } from '@angular/core';
import { Router } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import ArrowLeft02Icon from '@hugeicons/core-free-icons/ArrowLeft02Icon';
import { StudyStore } from './study.store';
import { DeckService } from '../../core/decks/deck.service';
import { TeamBadge } from '../../shared/ui/team-badge';

@Component({
  selector: 'app-study',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TeamBadge, HugeiconsIconComponent],
  templateUrl: './study.html',
  styleUrl: './study.scss',
})
export class Study {
  readonly store = inject(StudyStore);
  private router = inject(Router);
  private deckService = inject(DeckService);
  readonly deckId = input.required<string>();

  readonly Home01Icon = Home01Icon;
  readonly ArrowLeft02Icon = ArrowLeft02Icon;

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
    this.router.navigate(['/estudo'], externalId ? { queryParams: { league: externalId } } : {});
  }

  private confirmLeave(): boolean {
    const sessionInProgress = !!this.store.current();
    return !sessionInProgress || confirm('Sair do estudo? Sua sessão será interrompida.');
  }
}
