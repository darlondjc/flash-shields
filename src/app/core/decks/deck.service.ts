import { Injectable, inject } from '@angular/core';
import { DbService } from '../persistence/db.service';
import { League } from '../models/league.model';
import { Deck } from '../models/deck.model';

@Injectable({ providedIn: 'root' })
export class DeckService {
  private db = inject(DbService);

  async createLeagueDeck(league: League): Promise<Deck> {
    const id = `deck-league-${league.id}`;
    const existing = await this.db.decks.get(id);
    if (existing) return existing;

    const teams = await this.db.teams.where('leagueIds').equals(league.id).toArray();
    const deck: Deck = {
      id,
      name: league.name,
      scope: { kind: 'league', leagueId: league.id },
      teamIds: teams.map(team => team.id),
      createdAt: new Date().toISOString(),
    };
    await this.db.decks.put(deck);
    return deck;
  }

  listDecks(): Promise<Deck[]> {
    return this.db.decks.toArray();
  }

  getDeck(id: string): Promise<Deck | undefined> {
    return this.db.decks.get(id);
  }
}
