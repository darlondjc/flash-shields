import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { GameStore } from './game.store';
import { DeckService } from '../../core/decks/deck.service';
import { DbService } from '../../core/persistence/db.service';
import { Team } from '../../core/models/team.model';
import { Deck } from '../../core/models/deck.model';

function makeTeam(id: string): Team {
  return {
    id,
    externalIds: {},
    name: `Team ${id}`,
    alternateNames: [],
    country: 'England',
    leagueIds: [],
    badgeUrl: 'https://example.com/x.png',
  };
}

describe('GameStore', () => {
  let store: GameStore;
  let db: DbService;
  let deckServiceSpy: { getDeck: ReturnType<typeof vi.fn> };

  const deck: Deck = {
    id: 'deck-1',
    name: 'Premier League',
    scope: { kind: 'league', leagueId: 'ts-4328' },
    teamIds: ['ts-1', 'ts-2', 'ts-3', 'ts-4', 'ts-5'],
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    deckServiceSpy = { getDeck: vi.fn().mockResolvedValue(deck) };

    TestBed.configureTestingModule({ providers: [{ provide: DeckService, useValue: deckServiceSpy }] });
    store = TestBed.inject(GameStore);
    db = TestBed.inject(DbService);
    await db.teams.clear();
    await db.teams.bulkPut(deck.teamIds.map(makeTeam));
  });

  it('loads a round of questions for the deck', async () => {
    await store.load('deck-1', 3);
    expect(store.questions().length).toBe(3);
    expect(store.index()).toBe(0);
    expect(store.score()).toBe(0);
  });

  it('select() on the correct answer increments score and streak', async () => {
    await store.load('deck-1', 3);
    const correctId = store.current()!.correctTeam.id;

    store.select(correctId);

    expect(store.score()).toBe(1);
    expect(store.streak()).toBe(1);
    expect(store.bestStreak()).toBe(1);
  });

  it('select() on a wrong answer resets streak but keeps score', async () => {
    await store.load('deck-1', 3);
    const wrongId = store.current()!.options.find(t => t.id !== store.current()!.correctTeam.id)!.id;

    store.select(wrongId);

    expect(store.score()).toBe(0);
    expect(store.streak()).toBe(0);
  });

  it('next() advances the index and marks the round finished at the end', async () => {
    await store.load('deck-1', 1);
    store.select(store.current()!.correctTeam.id);
    store.next();
    expect(store.finished()).toBe(true);
  });
});
