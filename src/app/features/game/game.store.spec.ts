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
    await db.sessions.clear();
  });

  it('loads a round of questions for the deck', async () => {
    await store.load('deck-1', 'multiple-choice', 3);
    expect(store.questions().length).toBe(3);
    expect(store.index()).toBe(0);
    expect(store.score()).toBe(0);
  });

  it('select() on the correct answer increments score and streak', async () => {
    await store.load('deck-1', 'multiple-choice', 3);
    const correctId = store.current()!.correctTeam.id;

    store.select(correctId);

    expect(store.score()).toBe(1);
    expect(store.streak()).toBe(1);
    expect(store.bestStreak()).toBe(1);
  });

  it('select() on a wrong answer resets streak but keeps score', async () => {
    await store.load('deck-1', 'multiple-choice', 3);
    const wrongId = store.current()!.options.find(t => t.id !== store.current()!.correctTeam.id)!.id;

    store.select(wrongId);

    expect(store.score()).toBe(0);
    expect(store.streak()).toBe(0);
  });

  it('next() advances the index and marks the round finished at the end', async () => {
    await store.load('deck-1', 'multiple-choice', 1);
    store.select(store.current()!.correctTeam.id);
    store.next();
    expect(store.finished()).toBe(true);
  });

  it('records a session once the round finishes', async () => {
    await store.load('deck-1', 'multiple-choice', 1);
    const correctId = store.current()!.correctTeam.id;
    store.select(correctId);
    await store.next();

    const sessions = await db.sessions.where('deckId').equals('deck-1').toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].mode).toBe('multiple-choice');
    expect(sessions[0].score).toBe(1);
    expect(sessions[0].answers).toHaveLength(1);
    expect(sessions[0].answers[0].correct).toBe(true);
  });

  it('does not record a session before the round finishes', async () => {
    await store.load('deck-1', 'multiple-choice', 3);
    store.select(store.current()!.correctTeam.id);
    await store.next();

    const sessions = await db.sessions.where('deckId').equals('deck-1').toArray();
    expect(sessions).toHaveLength(0);
  });

  it('does not record a duplicate session when next() is called again after the round finished', async () => {
    await store.load('deck-1', 'multiple-choice', 1);
    const correctId = store.current()!.correctTeam.id;
    store.select(correctId);
    await store.next();
    await store.next();
    await store.next();

    const sessions = await db.sessions.where('deckId').equals('deck-1').toArray();
    expect(sessions).toHaveLength(1);
  });

  it('loads reverse mode questions', async () => {
    await store.load('deck-1', 'reverse', 3);
    expect(store.questions().length).toBe(3);
    expect(store.mode()).toBe('reverse');
    expect(store.current()!.correctTeam).toBeDefined();
    expect(store.current()!.options.length).toBe(4);
  });

  it('records a reverse mode session', async () => {
    await store.load('deck-1', 'reverse', 1);
    const correctId = store.current()!.correctTeam.id;
    store.select(correctId);
    await store.next();

    const sessions = await db.sessions.where('deckId').equals('deck-1').toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].mode).toBe('reverse');
    expect(sessions[0].score).toBe(1);
  });

  describe('handleBadgeLoadFailure', () => {
    it('replaces a failing distractor option with a different team, keeping the correct team', async () => {
      await store.load('deck-1', 'multiple-choice', 1);
      const question = store.current()!;
      const correctId = question.correctTeam.id;
      const originalOptionIds = question.options.map(o => o.id);
      const failedOptionId = question.options.find(o => o.id !== correctId)!.id;

      store.handleBadgeLoadFailure(question, failedOptionId);

      const updated = store.current()!;
      expect(updated.correctTeam.id).toBe(correctId);
      expect(updated.options.length).toBe(4);
      expect(updated.options.map(o => o.id)).toContain(correctId);
      expect(updated.options.map(o => o.id)).not.toContain(failedOptionId);
      // Only 1 of the deck's 5 teams was left unused by the original question.
      const newOptionIds = updated.options.map(o => o.id);
      expect(newOptionIds.filter(id => !originalOptionIds.includes(id))).toHaveLength(1);
    });

    it("regenerates the whole question when the correct team's own badge fails", async () => {
      await store.load('deck-1', 'multiple-choice', 1);
      const question = store.current()!;
      const correctId = question.correctTeam.id;

      store.handleBadgeLoadFailure(question, correctId);

      const updated = store.current()!;
      expect(updated.correctTeam.id).not.toBe(correctId);
      expect(updated.options.map(o => o.id)).not.toContain(correctId);
    });

    it('ignores a badge failure reported for a question that is no longer current', async () => {
      await store.load('deck-1', 'multiple-choice', 2);
      const firstQuestion = store.current()!;
      store.select(firstQuestion.correctTeam.id);
      await store.next();
      const secondQuestion = store.current()!;

      store.handleBadgeLoadFailure(firstQuestion, firstQuestion.correctTeam.id);

      expect(store.current()).toBe(secondQuestion);
    });

    it('ignores a badge failure after the current question has already been answered', async () => {
      await store.load('deck-1', 'multiple-choice', 1);
      const question = store.current()!;
      const distractorId = question.options.find(o => o.id !== question.correctTeam.id)!.id;
      store.select(question.correctTeam.id);

      store.handleBadgeLoadFailure(question, distractorId);

      expect(store.current()).toBe(question);
    });
  });
});
