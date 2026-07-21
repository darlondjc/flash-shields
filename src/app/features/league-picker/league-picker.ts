import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import Book01Icon from '@hugeicons/core-free-icons/Book01Icon';
import Quiz01Icon from '@hugeicons/core-free-icons/Quiz01Icon';
import Exchange01Icon from '@hugeicons/core-free-icons/Exchange01Icon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { LeagueService } from '../../core/leagues/league.service';
import { countryOptions, leaguesForCountry, countryFlag, CountryOption } from '../../core/leagues/league-catalog';
import { LEAGUES_TO_IMPORT, LeagueImportConfig } from '../../core/data/league-import.config';
import { Deck } from '../../core/models/deck.model';
import { League } from '../../core/models/league.model';
import { LeagueBadge } from '../../shared/ui/league-badge';

const LAST_LEAGUE_KEY_PREFIX = 'flash-shields:last-league:';

export type LeaguePickerAction = 'study' | 'play' | 'reverse';

@Component({
  selector: 'app-league-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HugeiconsIconComponent, LeagueBadge],
  templateUrl: './league-picker.html',
  host: { '[attr.data-accent]': 'accent()' },
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

  // The picker serves both /estudo and /jogos, so it inherits the module
  // accent from the route's actions instead of owning a fixed one.
  readonly accent = computed(() => (this.actions().includes('study') ? 'green' : 'purple'));

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

    // `actions()` only holds its real bound value once Angular applies inputs
    // (which happens after the constructor runs), so this can't be called
    // directly above — effect() defers it to the first change-detection pass,
    // by which point the real value is in place.
    effect(() => {
      this.restoreLastSelection();
    });

    // Background imports (first-run boot import, or "Atualizar dados
    // importados" from Configurações) tick ImportService.progress as each
    // league lands, so this keeps the league/deck list live without the user
    // needing to leave and come back to this screen.
    effect(() => {
      this.importService.progress();
      void this.refreshDecks();
    });
  }

  showsAction(action: LeaguePickerAction): boolean {
    return this.actions().includes(action);
  }

  private restoreLastSelection() {
    const externalId = this.route.snapshot.queryParamMap.get('league') ?? localStorage.getItem(this.lastLeagueKey());
    if (!externalId) return;

    const config = this.leagueConfigs.find(c => c.externalId === externalId);
    if (!config) return;

    this.selectedCountry.set(config.country);
    this.selected.set(config);
  }

  private lastLeagueKey(): string {
    return `${LAST_LEAGUE_KEY_PREFIX}${[...this.actions()].sort().join('-')}`;
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
      this.rememberSelection(config);
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

      this.rememberSelection(config);
      void this.refreshDecks();
    } catch {
      this.selected.set(null);
      this.error.set('Falha ao importar. Tente novamente.');
    } finally {
      this.importingId.set(null);
    }
  }

  private rememberSelection(config: LeagueImportConfig) {
    this.selected.set(config);
    localStorage.setItem(this.lastLeagueKey(), config.externalId);
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
