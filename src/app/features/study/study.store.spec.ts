import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { StudyStore } from './study.store';
import { SrsService } from '../../core/srs/srs.service';
import { SessionService } from '../../core/session/session.service';
import { Team } from '../../core/models/team.model';
import { SessionAnswer } from '../../core/models/session.model';

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
  let sessionServiceSpy: { finish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    srsSpy = { buildDailyQueue: vi.fn(), grade: vi.fn() };
    sessionServiceSpy = { finish: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        { provide: SrsService, useValue: srsSpy },
        { provide: SessionService, useValue: sessionServiceSpy },
      ],
    });
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

  it('grade() advances the queue and resets revealed when the card graduates', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1'), makeTeam('ts-2')]);
    srsSpy.grade.mockResolvedValue(1);
    await store.load('deck-1');
    store.reveal();

    await store.grade('acertou');

    expect(srsSpy.grade).toHaveBeenCalledWith('deck-1', 'ts-1', 'acertou');
    expect(store.current()?.id).toBe('ts-2');
    expect(store.revealed()).toBe(false);
  });

  it('re-inserts the card 3 positions later when it falls back to level 0', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([
      makeTeam('ts-1'), makeTeam('ts-2'), makeTeam('ts-3'), makeTeam('ts-4'),
    ]);
    srsSpy.grade.mockResolvedValue(0);
    await store.load('deck-1');
    store.reveal();

    await store.grade('errei');

    expect(store.remaining()).toBe(4);
    expect(store.queue().map(t => t.id)).toEqual(['ts-2', 'ts-3', 'ts-4', 'ts-1']);
  });

  it('re-inserts the card right after whatever remains when fewer than 3 cards are left', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1'), makeTeam('ts-2')]);
    srsSpy.grade.mockResolvedValue(0);
    await store.load('deck-1');
    store.reveal();

    await store.grade('errei');

    expect(store.queue().map(t => t.id)).toEqual(['ts-2', 'ts-1']);
  });

  it('records a session once the queue is fully cleared', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1')]);
    srsSpy.grade.mockResolvedValue(1);
    await store.load('deck-1');
    store.reveal();

    await store.grade('acertou');

    expect(sessionServiceSpy.finish).toHaveBeenCalledTimes(1);
    const [deckId, mode, answers] = sessionServiceSpy.finish.mock.calls[0];
    expect(deckId).toBe('deck-1');
    expect(mode).toBe('study');
    expect(answers).toEqual([expect.objectContaining({ teamId: 'ts-1', correct: true })]);
  });

  it('does not record a session while a relearning card still remains in the queue', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1')]);
    srsSpy.grade.mockResolvedValue(0);
    await store.load('deck-1');
    store.reveal();

    await store.grade('errei');

    expect(sessionServiceSpy.finish).not.toHaveBeenCalled();
  });

  it('marks "errei" answers as incorrect and every other grade as correct', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1'), makeTeam('ts-2')]);
    srsSpy.grade
      .mockResolvedValueOnce(0) // ts-1 errei -> relearn, reinserted
      .mockResolvedValueOnce(2) // ts-2 dificil -> graduates
      .mockResolvedValueOnce(1); // ts-1 (relearned) acertou -> graduates, queue empties
    await store.load('deck-1');

    store.reveal();
    await store.grade('errei');
    store.reveal();
    await store.grade('dificil');
    store.reveal();
    await store.grade('acertou');

    expect(sessionServiceSpy.finish).toHaveBeenCalledTimes(1);
    const answers = sessionServiceSpy.finish.mock.calls[0][2] as SessionAnswer[];
    expect(answers.map(a => ({ teamId: a.teamId, correct: a.correct }))).toEqual([
      { teamId: 'ts-1', correct: false },
      { teamId: 'ts-2', correct: true },
      { teamId: 'ts-1', correct: true },
    ]);
  });
});
