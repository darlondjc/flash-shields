import { Injectable, inject } from '@angular/core';
import { DbService } from '../persistence/db.service';
import { League } from '../models/league.model';
import { Deck } from '../models/deck.model';
import { Team } from '../models/team.model';

@Injectable({ providedIn: 'root' })
export class DeckService {
  private db = inject(DbService);

  async createLeagueDeck(league: League): Promise<Deck> {
    const id = `deck-league-${league.id}`;
    const teams = await this.getLeagueTeams(league);
    const deck: Deck = {
      id,
      name: league.name,
      scope: { kind: 'league', leagueId: league.id },
      teamIds: teams.map(team => team.id),
      createdAt: new Date().toISOString(),
    };

    const existing = await this.db.decks.get(id);
    if (existing && this.isSameDeck(existing, deck)) return existing;

    await this.db.decks.put(deck);
    return deck;
  }

  private async getLeagueTeams(league: League): Promise<Team[]> {
    const allTeams = await this.db.teams.toArray();
    return allTeams.filter(team => this.teamBelongsToLeague(team, league));
  }

  private teamBelongsToLeague(team: Team, league: League): boolean {
    if (team.leagueIds.includes(league.id)) {
      return true;
    }

    const scopedLeaguePrefix = `ts-${league.id.replace(/^ts-/, '')}-`;
    return team.id.startsWith(scopedLeaguePrefix);
  }

  private isSameDeck(existing: Deck, deck: Deck): boolean {
    if (existing.name !== deck.name || existing.scope.kind !== deck.scope.kind) {
      return false;
    }

    if (existing.scope.kind === 'league' && deck.scope.kind === 'league') {
      return existing.scope.leagueId === deck.scope.leagueId
        && existing.teamIds.length === deck.teamIds.length
        && existing.teamIds.every((teamId, index) => teamId === deck.teamIds[index]);
    }

    return existing.teamIds.length === deck.teamIds.length
      && existing.teamIds.every((teamId, index) => teamId === deck.teamIds[index]);
  }

  listDecks(): Promise<Deck[]> {
    return this.db.decks.toArray();
  }

  getDeck(id: string): Promise<Deck | undefined> {
    return this.db.decks.get(id);
  }
}
