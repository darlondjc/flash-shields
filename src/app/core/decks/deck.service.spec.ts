import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { DeckService } from './deck.service';
import { DbService } from '../persistence/db.service';
import { League } from '../models/league.model';
import { Team } from '../models/team.model';

function makeLeague(): League {
  return {
    id: 'ts-4328',
    externalIds: { thesportsdb: '4328' },
    name: 'Premier League',
    country: 'England',
    regionId: 'europe',
    sport: 'soccer',
  };
}

function makeTeam(id: string): Team {
  return {
    id,
    externalIds: { thesportsdb: id },
    name: `Team ${id}`,
    alternateNames: [],
    country: 'England',
    leagueIds: ['ts-4328'],
    badgeUrl: 'https://example.com/x.png',
  };
}

describe('DeckService', () => {
  let service: DeckService;
  let db: DbService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DeckService);
    db = TestBed.inject(DbService);
    await db.decks.clear();
    await db.teams.clear();
    await db.teams.bulkPut([makeTeam('ts-1'), makeTeam('ts-2')]);
  });

  it('creates a deck containing every team of the league', async () => {
    const deck = await service.createLeagueDeck(makeLeague());
    expect(deck.id).toBe('deck-league-ts-4328');
    expect(deck.scope).toEqual({ kind: 'league', leagueId: 'ts-4328' });
    expect(new Set(deck.teamIds)).toEqual(new Set(['ts-1', 'ts-2']));
  });

  it('returns the existing deck instead of creating a duplicate', async () => {
    const first = await service.createLeagueDeck(makeLeague());
    const second = await service.createLeagueDeck(makeLeague());
    expect(second.id).toBe(first.id);
    const allDecks = await db.decks.toArray();
    expect(allDecks.length).toBe(1);
  });

  it('lists and fetches decks', async () => {
    await service.createLeagueDeck(makeLeague());
    const decks = await service.listDecks();
    expect(decks.length).toBe(1);
    const fetched = await service.getDeck(decks[0].id);
    expect(fetched?.id).toBe(decks[0].id);
  });
});
