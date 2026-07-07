import { applySm2, today, addDays } from './sm2';
import { ReviewState } from '../models/review-state.model';

function makeState(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    teamId: 'team-1',
    deckId: 'deck-1',
    repetitions: 0,
    easeFactor: 2.5,
    intervalDays: 0,
    dueDate: today(),
    lapses: 0,
    suspended: false,
    ...overrides,
  };
}

describe('applySm2', () => {
  it('resets repetitions and schedules for tomorrow on a fail (quality 0)', () => {
    const state = makeState({ repetitions: 3, intervalDays: 10, lapses: 1 });
    const result = applySm2(state, 0);
    expect(result.repetitions).toBe(0);
    expect(result.intervalDays).toBe(1);
    expect(result.lapses).toBe(2);
    expect(result.dueDate).toBe(addDays(today(), 1));
  });

  it('schedules a first-time pass for 1 day out', () => {
    const state = makeState({ repetitions: 0 });
    const result = applySm2(state, 4);
    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.dueDate).toBe(addDays(today(), 1));
  });

  it('schedules a second consecutive pass for 6 days out', () => {
    const state = makeState({ repetitions: 1, intervalDays: 1 });
    const result = applySm2(state, 4);
    expect(result.repetitions).toBe(2);
    expect(result.intervalDays).toBe(6);
  });

  it('multiplies the interval by the ease factor from the third pass onward', () => {
    const state = makeState({ repetitions: 2, intervalDays: 6, easeFactor: 2.5 });
    const result = applySm2(state, 4);
    expect(result.repetitions).toBe(3);
    expect(result.intervalDays).toBe(Math.round(6 * 2.5));
  });

  it('never drops the ease factor below 1.3', () => {
    const state = makeState({ repetitions: 5, intervalDays: 20, easeFactor: 1.3 });
    const result = applySm2(state, 3);
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('raises the ease factor on an easy pass (quality 5)', () => {
    const state = makeState({ repetitions: 2, intervalDays: 6, easeFactor: 2.5 });
    const result = applySm2(state, 5);
    expect(result.easeFactor).toBeGreaterThan(2.5);
  });
});
