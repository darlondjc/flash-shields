import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { MVP_LEAGUES_TO_IMPORT, LeagueImportConfig } from '../../core/data/league-import.config';
import { Deck } from '../../core/models/deck.model';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private importService = inject(ImportService);
  private deckService = inject(DeckService);

  readonly leagueConfigs = MVP_LEAGUES_TO_IMPORT;
  readonly decks = signal<Deck[]>([]);
  readonly importingId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly progress = this.importService.progress;

  constructor() {
    this.refreshDecks();
  }

  deckForLeague(externalId: string): Deck | undefined {
    const leagueId = `ts-${externalId}`;
    return this.decks().find(deck => deck.scope.kind === 'league' && deck.scope.leagueId === leagueId);
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
  }
}
