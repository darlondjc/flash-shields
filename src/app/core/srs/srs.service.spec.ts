import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { SrsService } from './srs.service';
import { DbService } from '../persistence/db.service';
import { DeckService } from '../decks/deck.service';
import { Team } from '../models/team.model';
import { today, addDays } from './level';

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

describe('SrsService', () => {
  let service: SrsService;
  let db: DbService;
  let deckService: DeckService;
  let deckId: string;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SrsService);
    db = TestBed.inject(DbService);
    deckService = TestBed.inject(DeckService);

    await db.teams.clear();
    await db.decks.clear();
    await db.reviewStates.clear();
    await db.sessions.clear();
    await db.teams.bulkPut([makeTeam('ts-1'), makeTeam('ts-2'), makeTeam('ts-3')]);
    const deck = await deckService.createLeagueDeck({
      id: 'ts-4328',
      externalIds: {},
      name: 'Premier League',
      country: 'England',
      regionId: 'europe',
      sport: 'soccer',
    });
    deckId = deck.id;
  });

  it('includes teams with no ReviewState yet as new cards', async () => {
    const queue = await service.buildDailyQueue(deckId);
    expect(queue.map(t => t.id).sort()).toEqual(['ts-1', 'ts-2', 'ts-3']);
  });

  it('persists a fresh, due ReviewState at level 0 for each new card it queues', async () => {
    await service.buildDailyQueue(deckId);
    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    expect(state).toBeDefined();
    expect(state?.level).toBe(0);
    expect(state?.dueDate).toBe(today());
  });

  it('excludes suspended cards from the queue', async () => {
    await service.buildDailyQueue(deckId);
    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    await db.reviewStates.put({ ...state!, suspended: true });

    const queue = await service.buildDailyQueue(deckId);
    expect(queue.map(t => t.id)).not.toContain('ts-1');
  });

  it('grade() applies the level engine, returns the resulting level, and persists it', async () => {
    await service.buildDailyQueue(deckId);
    const level = await service.grade(deckId, 'ts-1', 'acertou');

    expect(level).toBe(1);
    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    expect(state?.level).toBe(1);
    expect(state?.dueDate).toBe(addDays(today(), 1));
  });

  it('re-queues a card for today and counts a lapse after grading it "errei"', async () => {
    await service.buildDailyQueue(deckId);
    const level = await service.grade(deckId, 'ts-1', 'errei');

    expect(level).toBe(0);
    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    expect(state?.dueDate).toBe(today());
    expect(state?.lapses).toBe(1);
  });

  it('shuffles the queue order instead of always presenting the same team first', async () => {
    const manyTeams = Array.from({ length: 20 }, (_, i) => makeTeam(`ts-${i}`));
    await db.teams.bulkPut(manyTeams);
    const deck = await deckService.createLeagueDeck({
      id: 'ts-4328',
      externalIds: {},
      name: 'Premier League',
      country: 'England',
      regionId: 'europe',
      sport: 'soccer',
    });

    const insertionOrder = deck.teamIds;
    const queue = await service.buildDailyQueue(deck.id);

    expect(queue.map(t => t.id)).not.toEqual(insertionOrder);
  });

  describe('getDeckSummary', () => {
    it('returns zeroed-out stats for a deck with no ReviewState and no sessions yet', async () => {
      const summary = await service.getDeckSummary(deckId);
      expect(summary.memorizedCount).toBe(0);
      expect(summary.toRevisitCount).toBe(3);
      expect(summary.lastStudiedAt).toBeNull();
      expect(summary.nextStudyAvailable).toBe(true);
      expect(summary.nextStudyDueDate).toBeNull();
    });

    it('counts a card as memorized only when its lastGrade is "facil"', async () => {
      await service.buildDailyQueue(deckId);
      await service.grade(deckId, 'ts-1', 'facil');
      await service.grade(deckId, 'ts-2', 'acertou');

      const summary = await service.getDeckSummary(deckId);
      expect(summary.memorizedCount).toBe(1);
    });

    it('drops a card out of memorized once it is graded anything other than "facil" again', async () => {
      await service.buildDailyQueue(deckId);
      await service.grade(deckId, 'ts-1', 'facil');
      // grade() applies by id regardless of dueDate, so re-grading the same
      // card works even though "facil" just pushed it past today.
      await service.grade(deckId, 'ts-1', 'dificil');

      const summary = await service.getDeckSummary(deckId);
      expect(summary.memorizedCount).toBe(0);
    });

    it('counts toRevisit as due cards plus never-seen cards', async () => {
      await service.buildDailyQueue(deckId);
      await service.grade(deckId, 'ts-1', 'facil'); // pushed to a future dueDate, no longer due today

      const summary = await service.getDeckSummary(deckId);
      // ts-2 and ts-3 are still due today (level 0), ts-1 is not due -> 2 due + 0 new
      expect(summary.toRevisitCount).toBe(2);
    });

    it('reads lastStudiedAt from the most recent "study" session for this deck only', async () => {
      await db.sessions.bulkPut([
        { id: 's1', deckId, mode: 'study', startedAt: '2026-07-01T10:00:00.000Z', answers: [] },
        { id: 's2', deckId, mode: 'study', startedAt: '2026-07-10T10:00:00.000Z', answers: [] },
        { id: 's3', deckId, mode: 'multiple-choice', startedAt: '2026-07-20T10:00:00.000Z', answers: [] },
        { id: 's4', deckId: 'other-deck', mode: 'study', startedAt: '2026-07-15T10:00:00.000Z', answers: [] },
      ]);

      const summary = await service.getDeckSummary(deckId);
      expect(summary.lastStudiedAt).toBe('2026-07-10T10:00:00.000Z');
    });

    it('sets nextStudyAvailable when there is anything due or new today', async () => {
      await service.buildDailyQueue(deckId);
      const summary = await service.getDeckSummary(deckId);
      expect(summary.nextStudyAvailable).toBe(true);
      expect(summary.nextStudyDueDate).toBeNull();
    });

    it('computes nextStudyDueDate as the earliest future dueDate once nothing is pending today', async () => {
      await service.buildDailyQueue(deckId);
      await service.grade(deckId, 'ts-1', 'acertou'); // level 0 -> 1, due in 1 day
      await service.grade(deckId, 'ts-2', 'facil'); // level 0 -> 2, due in 3 days
      await service.grade(deckId, 'ts-3', 'facil'); // level 0 -> 2, due in 3 days

      const summary = await service.getDeckSummary(deckId);
      expect(summary.nextStudyAvailable).toBe(false);
      expect(summary.nextStudyDueDate).toBe(addDays(today(), 1));
    });
  });

  describe('buildExtraQueue', () => {
    it('includes teams with no ReviewState yet as new cards', async () => {
      const queue = await service.buildExtraQueue(deckId);
      expect(queue.map(t => t.id).sort()).toEqual(['ts-1', 'ts-2', 'ts-3']);
    });

    it('persists a fresh, due ReviewState for each new card it queues', async () => {
      await service.buildExtraQueue(deckId);
      const state = await db.reviewStates.get(`${deckId}:ts-1`);
      expect(state).toBeDefined();
      expect(state?.level).toBe(0);
      expect(state?.dueDate).toBe(today());
    });

    it('includes cards that are not due yet', async () => {
      await service.buildDailyQueue(deckId);
      await service.grade(deckId, 'ts-1', 'facil'); // pushes ts-1's dueDate into the future

      const queue = await service.buildExtraQueue(deckId);
      expect(queue.map(t => t.id).sort()).toEqual(['ts-1', 'ts-2', 'ts-3']);
    });

    it('includes suspended cards', async () => {
      await service.buildDailyQueue(deckId);
      const state = await db.reviewStates.get(`${deckId}:ts-1`);
      await db.reviewStates.put({ ...state!, suspended: true });

      const queue = await service.buildExtraQueue(deckId);
      expect(queue.map(t => t.id)).toContain('ts-1');
    });

    it('shuffles the queue order instead of always presenting the same team first', async () => {
      const manyTeams = Array.from({ length: 20 }, (_, i) => makeTeam(`ts-${i}`));
      await db.teams.bulkPut(manyTeams);
      const deck = await deckService.createLeagueDeck({
        id: 'ts-4328',
        externalIds: {},
        name: 'Premier League',
        country: 'England',
        regionId: 'europe',
        sport: 'soccer',
      });

      const insertionOrder = deck.teamIds;
      const queue = await service.buildExtraQueue(deck.id);

      expect(queue.map(t => t.id)).not.toEqual(insertionOrder);
    });
  });
});
