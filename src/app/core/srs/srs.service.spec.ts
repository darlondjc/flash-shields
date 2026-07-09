import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { SrsService } from './srs.service';
import { DbService } from '../persistence/db.service';
import { DeckService } from '../decks/deck.service';
import { Team } from '../models/team.model';
import { today, addDays } from './sm2';

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

  it('persists a fresh, due ReviewState for each new card it queues', async () => {
    await service.buildDailyQueue(deckId);
    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    expect(state).toBeDefined();
    expect(state?.repetitions).toBe(0);
    expect(state?.dueDate).toBe(today());
  });

  it('excludes suspended cards from the queue', async () => {
    await service.buildDailyQueue(deckId);
    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    await db.reviewStates.put({ ...state!, suspended: true });

    const queue = await service.buildDailyQueue(deckId);
    expect(queue.map(t => t.id)).not.toContain('ts-1');
  });

  it('grade() applies SM-2 and persists the updated state', async () => {
    await service.buildDailyQueue(deckId);
    await service.grade(deckId, 'ts-1', 4);

    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    expect(state?.repetitions).toBe(1);
    expect(state?.dueDate).toBe(addDays(today(), 1));
  });

  it('re-queues a card due today after grading it as a fail', async () => {
    await service.buildDailyQueue(deckId);
    await service.grade(deckId, 'ts-1', 0);

    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    expect(state?.dueDate).toBe(addDays(today(), 1));
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
});
