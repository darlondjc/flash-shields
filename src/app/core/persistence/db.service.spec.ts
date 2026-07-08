import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { DbService } from './db.service';
import { Team } from '../models/team.model';
import { Session } from '../models/session.model';

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'ts-1',
    externalIds: { thesportsdb: '1' },
    name: 'Arsenal',
    alternateNames: [],
    country: 'England',
    leagueIds: ['ts-4328'],
    badgeUrl: 'https://example.com/arsenal.png',
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    deckId: 'deck-1',
    mode: 'multiple-choice',
    startedAt: new Date().toISOString(),
    answers: [],
    score: 0,
    ...overrides,
  };
}

describe('DbService', () => {
  let service: DbService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DbService);
    await service.teams.clear();
    await service.sessions.clear();
  });

  it('stores and retrieves a team', async () => {
    await service.teams.put(makeTeam());
    const found = await service.teams.get('ts-1');
    expect(found?.name).toBe('Arsenal');
  });

  it('upsertTeam inserts a new team as-is', async () => {
    await service.upsertTeam(makeTeam());
    const found = await service.teams.get('ts-1');
    expect(found?.leagueIds).toEqual(['ts-4328']);
  });

  it('upsertTeam merges leagueIds instead of overwriting on re-import', async () => {
    await service.upsertTeam(makeTeam({ leagueIds: ['ts-4328'] }));
    await service.upsertTeam(makeTeam({ leagueIds: ['ts-4329'], name: 'Arsenal FC' }));

    const found = await service.teams.get('ts-1');
    expect(found?.name).toBe('Arsenal FC');
    expect(new Set(found?.leagueIds)).toEqual(new Set(['ts-4328', 'ts-4329']));
  });

  it('stores and retrieves a session', async () => {
    await service.sessions.put(makeSession());
    const found = await service.sessions.get('sess-1');
    expect(found?.deckId).toBe('deck-1');
    expect(found?.mode).toBe('multiple-choice');
  });
});
