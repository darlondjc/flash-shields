import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  Shield01Icon,
  Settings01Icon,
  ChartColumnIncreasingIcon,
  Book01Icon,
  Quiz01Icon,
} from '@hugeicons/core-free-icons';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { LeagueService } from '../../core/leagues/league.service';
import { MVP_LEAGUES_TO_IMPORT, LeagueImportConfig } from '../../core/data/league-import.config';
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

  readonly leagueConfigs = MVP_LEAGUES_TO_IMPORT;
  readonly decks = signal<Deck[]>([]);
  readonly leagues = signal<Map<string, League>>(new Map());
  readonly importingId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly progress = this.importService.progress;

  readonly Shield01Icon = Shield01Icon;
  readonly Settings01Icon = Settings01Icon;
  readonly ChartColumnIncreasingIcon = ChartColumnIncreasingIcon;
  readonly Book01Icon = Book01Icon;
  readonly Quiz01Icon = Quiz01Icon;

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

  async importLeague(config: LeagueImportConfig) {
    this.error.set(null);
    this.importingId.set(config.externalId);
    try {
      const league = await this.importService.importLeague(config);
      await this.deckService.createLeagueDeck(league);
      await this.refreshDecks();
    } catch {
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
