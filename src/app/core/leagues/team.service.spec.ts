import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { TeamService } from './team.service';
import { DbService } from '../persistence/db.service';
import { Team } from '../models/team.model';

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'ts-4328-1',
    externalIds: { thesportsdb: '1' },
    name: 'Arsenal',
    alternateNames: [],
    country: 'England',
    leagueIds: ['ts-4328'],
    badgeUrl: 'https://example.com/arsenal.png',
    ...overrides,
  };
}

describe('TeamService', () => {
  let service: TeamService;
  let db: DbService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TeamService);
    db = TestBed.inject(DbService);
    await db.teams.clear();
  });

  it('fetches a team by id', async () => {
    await db.teams.put(makeTeam());
    const team = await service.getTeam('ts-4328-1');
    expect(team?.name).toBe('Arsenal');
  });

  it('returns undefined for a team that has not been imported yet', async () => {
    const team = await service.getTeam('ts-9999-1');
    expect(team).toBeUndefined();
  });

  it('finds a team by a case-insensitive substring of its name', async () => {
    await db.teams.put(makeTeam());
    const results = await service.searchByName('arse');
    expect(results.map(t => t.id)).toEqual(['ts-4328-1']);
  });

  it('finds a team by an alternate name', async () => {
    await db.teams.put(makeTeam({ alternateNames: ['The Gunners'] }));
    const results = await service.searchByName('gunners');
    expect(results.map(t => t.id)).toEqual(['ts-4328-1']);
  });

  it('returns an empty array when nothing matches', async () => {
    await db.teams.put(makeTeam());
    const results = await service.searchByName('nonexistent');
    expect(results).toEqual([]);
  });
});
