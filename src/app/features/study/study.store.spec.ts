import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { StudyStore } from './study.store';
import { SrsService } from '../../core/srs/srs.service';
import { Team } from '../../core/models/team.model';

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

describe('StudyStore', () => {
  let store: StudyStore;
  let srsSpy: { buildDailyQueue: ReturnType<typeof vi.fn>; grade: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    srsSpy = { buildDailyQueue: vi.fn(), grade: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: SrsService, useValue: srsSpy }] });
    store = TestBed.inject(StudyStore);
  });

  it('loads the daily queue for a deck', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1'), makeTeam('ts-2')]);
    await store.load('deck-1');
    expect(store.current()?.id).toBe('ts-1');
    expect(store.remaining()).toBe(2);
    expect(store.revealed()).toBe(false);
  });

  it('reveal() flips the revealed flag', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1')]);
    await store.load('deck-1');
    store.reveal();
    expect(store.revealed()).toBe(true);
  });

  it('grade() advances the queue and resets revealed', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1'), makeTeam('ts-2')]);
    srsSpy.grade.mockResolvedValue(undefined);
    await store.load('deck-1');
    store.reveal();

    await store.grade(4);

    expect(srsSpy.grade).toHaveBeenCalledWith('deck-1', 'ts-1', 4);
    expect(store.current()?.id).toBe('ts-2');
    expect(store.revealed()).toBe(false);
  });
});
