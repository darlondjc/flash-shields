import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { StatsStore } from './stats.store';
import { DbService } from '../../core/persistence/db.service';
import { Session } from '../../core/models/session.model';
import { Deck } from '../../core/models/deck.model';
import { League } from '../../core/models/league.model';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: crypto.randomUUID(),
    deckId: 'deck-1',
    mode: 'multiple-choice',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    answers: [],
    score: 0,
    ...overrides,
  };
}

function answer(correct: boolean) {
  return { teamId: 't1', correct, responseMs: 1000, answeredAt: new Date().toISOString() };
}

describe('StatsStore', () => {
  let store: StatsStore;
  let db: DbService;

  const deck: Deck = {
    id: 'deck-1',
    name: 'Premier League',
    scope: { kind: 'league', leagueId: 'ts-4328' },
    teamIds: [],
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(StatsStore);
    db = TestBed.inject(DbService);
    await db.sessions.clear();
    await db.decks.clear();
    await db.leagues.clear();
    await db.decks.put(deck);
  });

  it('reports zeroed stats when there are no sessions', async () => {
    await store.load();
    expect(store.totalSessions()).toBe(0);
    expect(store.overallAccuracy()).toBe(0);
    expect(store.accuracyByDeck()).toEqual([]);
    expect(store.bestStreakByMode()).toEqual([]);
  });

  it('aggregates total sessions and overall accuracy across all sessions', async () => {
    await db.sessions.bulkPut([
      makeSession({ answers: [answer(true), answer(false)] }),
      makeSession({ id: crypto.randomUUID(), answers: [answer(true)] }),
    ]);

    await store.load();

    expect(store.totalSessions()).toBe(2);
    expect(store.overallAccuracy()).toBeCloseTo(2 / 3);
  });

  it('breaks down accuracy per deck using the deck name', async () => {
    await db.sessions.put(makeSession({ deckId: 'deck-1', answers: [answer(true)] }));

    await store.load();

    expect(store.accuracyByDeck()).toEqual([
      { deckId: 'deck-1', deckName: 'Premier League', sessionCount: 1, accuracy: 1 },
    ]);
  });

  it('attaches the deck\'s league when one is stored for its scope', async () => {
    const league: League = {
      id: 'ts-4328',
      externalIds: { thesportsdb: '4328' },
      name: 'Premier League',
      country: 'England',
      regionId: 'europe',
      sport: 'soccer',
      badgeUrl: 'https://example.com/premier-league-badge.png',
    };
    await db.leagues.put(league);
    await db.sessions.put(makeSession({ deckId: 'deck-1', answers: [answer(true)] }));

    await store.load();

    expect(store.accuracyByDeck()[0].league).toEqual(league);
  });

  it('leaves the league undefined when none is stored for the deck\'s scope', async () => {
    await db.sessions.put(makeSession({ deckId: 'deck-1', answers: [answer(true)] }));

    await store.load();

    expect(store.accuracyByDeck()[0].league).toBeUndefined();
  });

  it('computes the best consecutive-correct streak per mode', async () => {
    await db.sessions.put(
      makeSession({ answers: [answer(true), answer(true), answer(false), answer(true)] }),
    );

    await store.load();

    expect(store.bestStreakByMode()).toEqual([{ mode: 'multiple-choice', bestStreak: 2 }]);
  });

  it('separates accuracy independently across multiple decks', async () => {
    const deck2: Deck = {
      id: 'deck-2',
      name: 'Segunda Divisão',
      scope: { kind: 'league', leagueId: 'ts-5000' },
      teamIds: [],
      createdAt: new Date().toISOString(),
    };
    await db.decks.put(deck2);

    // Deck 1: 2 sessions, 3 correct out of 4 answers (75% accuracy)
    await db.sessions.bulkPut([
      makeSession({ deckId: 'deck-1', answers: [answer(true), answer(false)] }),
      makeSession({ deckId: 'deck-1', answers: [answer(true), answer(true)] }),
    ]);

    // Deck 2: 1 session, 0 correct out of 2 answers (0% accuracy)
    await db.sessions.put(makeSession({ deckId: 'deck-2', answers: [answer(false), answer(false)] }));

    await store.load();

    const accuracyByDeck = store.accuracyByDeck();
    expect(accuracyByDeck.length).toBe(2);

    const deck1Accuracy = accuracyByDeck.find(d => d.deckId === 'deck-1');
    expect(deck1Accuracy).toEqual({
      deckId: 'deck-1',
      deckName: 'Premier League',
      sessionCount: 2,
      accuracy: 0.75,
    });

    const deck2Accuracy = accuracyByDeck.find(d => d.deckId === 'deck-2');
    expect(deck2Accuracy).toEqual({
      deckId: 'deck-2',
      deckName: 'Segunda Divisão',
      sessionCount: 1,
      accuracy: 0,
    });
  });
});
