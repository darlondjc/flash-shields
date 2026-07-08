import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { LeagueService } from './league.service';
import { DbService } from '../persistence/db.service';
import { League } from '../models/league.model';

function makeLeague(overrides: Partial<League> = {}): League {
  return {
    id: 'ts-4328',
    externalIds: { thesportsdb: '4328' },
    name: 'Premier League',
    country: 'England',
    regionId: 'europe',
    sport: 'soccer',
    ...overrides,
  };
}

describe('LeagueService', () => {
  let service: LeagueService;
  let db: DbService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LeagueService);
    db = TestBed.inject(DbService);
    await db.leagues.clear();
  });

  it('fetches a league by id', async () => {
    await db.leagues.put(makeLeague({ badgeUrl: 'https://example.com/premier.png' }));

    const league = await service.getLeague('ts-4328');

    expect(league?.name).toBe('Premier League');
    expect(league?.badgeUrl).toBe('https://example.com/premier.png');
  });

  it('returns undefined for a league that has not been imported yet', async () => {
    const league = await service.getLeague('ts-9999');
    expect(league).toBeUndefined();
  });
});
