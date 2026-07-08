import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  Shield01Icon,
  Settings01Icon,
  ChartColumnIncreasingIcon,
  Book01Icon,
  Quiz01Icon,
  Exchange01Icon,
  CheckmarkCircle02Icon,
} from '@hugeicons/core-free-icons';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { LeagueService } from '../../core/leagues/league.service';
import { LEAGUES_TO_IMPORT, LeagueImportConfig } from '../../core/data/league-import.config';
import { Deck } from '../../core/models/deck.model';
import { League } from '../../core/models/league.model';
import { LeagueBadge } from '../../shared/ui/league-badge';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HugeiconsIconComponent, LeagueBadge],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private importService = inject(ImportService);
  private deckService = inject(DeckService);
  private leagueService = inject(LeagueService);

  readonly leagueConfigs = LEAGUES_TO_IMPORT;
  readonly decks = signal<Deck[]>([]);
  readonly leagues = signal<Map<string, League>>(new Map());
  readonly selected = signal<LeagueImportConfig | null>(null);
  readonly selectedCountry = signal<string | null>(null);
  readonly importingId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly progress = this.importService.progress;

  readonly Shield01Icon = Shield01Icon;
  readonly Settings01Icon = Settings01Icon;
  readonly ChartColumnIncreasingIcon = ChartColumnIncreasingIcon;
  readonly Book01Icon = Book01Icon;
  readonly Quiz01Icon = Quiz01Icon;
  readonly Exchange01Icon = Exchange01Icon;
  readonly CheckmarkCircle02Icon = CheckmarkCircle02Icon;

  constructor() {
    this.refreshDecks();
  }

  deckForLeague(externalId: string): Deck | undefined {
    const leagueId = `ts-${externalId}`;
    return this.decks().find(deck => deck.scope.kind === 'league' && deck.scope.leagueId === leagueId);
  }

  leagueFor(externalId: string): League | undefined {
    return this.leagues().get(`ts-${externalId}`);
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(word => word.length > 2 || /^\d/.test(word))
      .slice(0, 2)
      .map(word => word[0]!.toUpperCase())
      .join('');
  }

  countryOptions(): Array<{ name: string; flag: string; count: number }> {
    const countries = new Map<string, { name: string; flag: string; count: number }>();

    for (const config of this.leagueConfigs) {
      const existing = countries.get(config.country);
      if (!existing) {
        countries.set(config.country, {
          name: config.country,
          flag: this.countryFlag(config.country),
          count: 1,
        });
        continue;
      }

      existing.count += 1;
    }

    return Array.from(countries.values());
  }

  leaguesForCountry(country: string): LeagueImportConfig[] {
    return this.leagueConfigs.filter(config => config.country === country);
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

  selectedLeague(): League | undefined {
    const selectedConfig = this.selected();
    if (!selectedConfig) {
      return undefined;
    }

    return this.leagueFor(selectedConfig.externalId);
  }

  selectedDeck(): Deck | undefined {
    const selectedConfig = this.selected();
    if (!selectedConfig) {
      return undefined;
    }

    return this.deckForLeague(selectedConfig.externalId);
  }

  countryFlag(country: string): string {
    const map: Record<string, string> = {
      Alemanha: '🇩🇪',
      Brasil: '🇧🇷',
      Espanha: '🇪🇸',
      França: '🇫🇷',
      Inglaterra: '🇬🇧',
      Itália: '🇮🇹',
      'Países Baixos': '🇳🇱',
      Portugal: '🇵🇹',
      Internacional: '🌍',
    };

    return map[country] ?? '🏟️';
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

  backToLeagues() {
    this.selected.set(null);
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
