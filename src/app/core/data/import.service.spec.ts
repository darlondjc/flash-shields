import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ImportService } from './import.service';
import { DbService } from '../persistence/db.service';
import { TheSportsDbAdapter } from './thesportsdb.adapter';
import { LeagueImportConfig } from './league-import.config';

describe('ImportService', () => {
  let service: ImportService;
  let db: DbService;
  let adapterSpy: { fetchTeamsForLeague: ReturnType<typeof vi.fn>; fetchLeagueBadge: ReturnType<typeof vi.fn> };

  const config: LeagueImportConfig = {
    externalId: '4328',
    name: 'Premier League',
    country: 'England',
    regionId: 'europe',
  };

  beforeEach(async () => {
    adapterSpy = { fetchTeamsForLeague: vi.fn(), fetchLeagueBadge: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: TheSportsDbAdapter, useValue: adapterSpy }],
    });
    service = TestBed.inject(ImportService);
    db = TestBed.inject(DbService);
    await db.leagues.clear();
    await db.teams.clear();
  });

  it('creates the league and upserts its teams', async () => {
    adapterSpy.fetchTeamsForLeague.mockResolvedValue([
      {
        externalId: '1',
        name: 'Arsenal',
        alternateNames: [],
        country: 'England',
        badgeUrl: 'https://example.com/a.png',
      },
    ]);

    const league = await service.importLeague(config);

    expect(league.id).toBe('ts-4328');
    expect(league.name).toBe('Premier League');
    const team = await db.teams.get('ts-1');
    expect(team?.name).toBe('Arsenal');
    expect(team?.leagueIds).toEqual(['ts-4328']);
  });

  it('is idempotent: re-importing does not duplicate teams', async () => {
    adapterSpy.fetchTeamsForLeague.mockResolvedValue([
      {
        externalId: '1',
        name: 'Arsenal',
        alternateNames: [],
        country: 'England',
        badgeUrl: 'https://example.com/a.png',
      },
    ]);

    await service.importLeague(config);
    await service.importLeague(config);

    const allTeams = await db.teams.toArray();
    expect(allTeams.length).toBe(1);
  });

  it('stores the league badge fetched from the adapter', async () => {
    adapterSpy.fetchTeamsForLeague.mockResolvedValue([]);
    adapterSpy.fetchLeagueBadge.mockResolvedValue('https://example.com/premier-league-badge.png');

    const league = await service.importLeague(config);

    expect(league.badgeUrl).toBe('https://example.com/premier-league-badge.png');
    const stored = await db.leagues.get('ts-4328');
    expect(stored?.badgeUrl).toBe('https://example.com/premier-league-badge.png');
  });

  it('leaves badgeUrl undefined when the adapter has no badge for the league', async () => {
    adapterSpy.fetchTeamsForLeague.mockResolvedValue([]);
    adapterSpy.fetchLeagueBadge.mockResolvedValue(undefined);

    const league = await service.importLeague(config);

    expect(league.badgeUrl).toBeUndefined();
  });
});
