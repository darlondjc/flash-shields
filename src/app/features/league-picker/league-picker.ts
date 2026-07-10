import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { Home01Icon, Book01Icon, Quiz01Icon, Exchange01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { LeagueService } from '../../core/leagues/league.service';
import { countryOptions, leaguesForCountry, countryFlag, CountryOption } from '../../core/leagues/league-catalog';
import { LEAGUES_TO_IMPORT, LeagueImportConfig } from '../../core/data/league-import.config';
import { Deck } from '../../core/models/deck.model';
import { League } from '../../core/models/league.model';
import { LeagueBadge } from '../../shared/ui/league-badge';

export type LeaguePickerAction = 'study' | 'play' | 'reverse';

@Component({
  selector: 'app-league-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HugeiconsIconComponent, LeagueBadge],
  templateUrl: './league-picker.html',
})
export class LeaguePicker {
  private importService = inject(ImportService);
  private deckService = inject(DeckService);
  private leagueService = inject(LeagueService);
  private route = inject(ActivatedRoute);

  // Bound from route `data.actions`/`data.title` via withComponentInputBinding()
  // (see app.routes.ts) — falls back to "everything" if the component is ever
  // routed to without route data.
  readonly actions = input<LeaguePickerAction[]>(['study', 'play', 'reverse']);
  readonly title = input('Selecionar liga');

  readonly leagueConfigs = LEAGUES_TO_IMPORT;
  readonly decks = signal<Deck[]>([]);
  readonly leagues = signal<Map<string, League>>(new Map());
  readonly selected = signal<LeagueImportConfig | null>(null);
  readonly selectedCountry = signal<string | null>(null);
  readonly importingId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly Home01Icon = Home01Icon;
  readonly Book01Icon = Book01Icon;
  readonly Quiz01Icon = Quiz01Icon;
  readonly Exchange01Icon = Exchange01Icon;
  readonly CheckmarkCircle02Icon = CheckmarkCircle02Icon;

  constructor() {
    this.refreshDecks();
    this.restoreSelectionFromQueryParams();
  }

  showsAction(action: LeaguePickerAction): boolean {
    return this.actions().includes(action);
  }

  private restoreSelectionFromQueryParams() {
    const externalId = this.route.snapshot.queryParamMap.get('league');
    if (!externalId) return;

    const config = this.leagueConfigs.find(c => c.externalId === externalId);
    if (!config) return;

    this.selectedCountry.set(config.country);
    this.selected.set(config);
  }

  deckForLeague(externalId: string): Deck | undefined {
    const leagueId = `ts-${externalId}`;
    return this.decks().find(deck => deck.scope.kind === 'league' && deck.scope.leagueId === leagueId);
  }

  leagueFor(externalId: string): League | undefined {
    return this.leagues().get(`ts-${externalId}`);
  }

  countryOptions(): CountryOption[] {
    return countryOptions(this.leagueConfigs);
  }

  leaguesForCountry(country: string): LeagueImportConfig[] {
    return leaguesForCountry(this.leagueConfigs, country);
  }

  countryFlag(country: string): string {
    return countryFlag(country);
  }

  selectCountry(country: string) {
    this.error.set(null);
    this.selectedCountry.set(country);
    this.selected.set(null);
  }

  backToCountries() {
    this.selectedCountry.set(null);
    this.selected.set(null);
  }

  backToLeagues() {
    this.selected.set(null);
  }

  selectedLeague(): League | undefined {
    const selectedConfig = this.selected();
    if (!selectedConfig) return undefined;
    return this.leagueFor(selectedConfig.externalId);
  }

  selectedDeck(): Deck | undefined {
    const selectedConfig = this.selected();
    if (!selectedConfig) return undefined;
    return this.deckForLeague(selectedConfig.externalId);
  }

  async selectLeague(config: LeagueImportConfig) {
    if (config.comingSoon) {
      this.error.set(`${config.name} em breve.`);
      return;
    }

    this.error.set(null);

    if (this.deckForLeague(config.externalId)) {
      this.selected.set(config);
      return;
    }

    this.importingId.set(config.externalId);
    try {
      const league = await this.importService.importLeague(config);
      const createdDeck = await this.deckService.createLeagueDeck(league);

      if (createdDeck) {
        const existingDecks = this.decks();
        const alreadyExists = existingDecks.some(deck => deck.id === createdDeck.id);
        this.decks.set(alreadyExists ? existingDecks : [...existingDecks, createdDeck]);
      }

      this.selected.set(config);
      void this.refreshDecks();
    } catch {
      this.selected.set(null);
      this.error.set('Falha ao importar. Tente novamente.');
    } finally {
      this.importingId.set(null);
    }
  }

  private async refreshDecks() {
    this.decks.set(await this.deckService.listDecks());
    await this.refreshLeagues();
  }

  private async refreshLeagues() {
    const entries = await Promise.all(
      this.leagueConfigs.map(async config => {
        const leagueId = `ts-${config.externalId}`;
        return [leagueId, await this.leagueService.getLeague(leagueId)] as const;
      }),
    );
    const map = new Map<string, League>();
    for (const [leagueId, league] of entries) {
      if (league) map.set(leagueId, league);
    }
    this.leagues.set(map);
  }
}
