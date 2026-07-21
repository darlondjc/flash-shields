import { applyLevelGrade, today, addDays, daysBetween } from './level';
import { ReviewState } from '../models/review-state.model';

function makeState(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    teamId: 'team-1',
    deckId: 'deck-1',
    level: 0,
    dueDate: today(),
    lapses: 0,
    suspended: false,
    ...overrides,
  };
}

describe('applyLevelGrade', () => {
  it('drops the level by 1 on "errei" and increments lapses', () => {
    const state = makeState({ level: 3, lapses: 1 });
    const result = applyLevelGrade(state, 'errei');
    expect(result.level).toBe(2);
    expect(result.lapses).toBe(2);
    expect(result.dueDate).toBe(addDays(today(), 3));
  });

  it('never drops the level below 0', () => {
    const state = makeState({ level: 0 });
    const result = applyLevelGrade(state, 'errei');
    expect(result.level).toBe(0);
    expect(result.dueDate).toBe(today());
  });

  it('keeps the level unchanged on "dificil" and does not count it as a lapse', () => {
    const state = makeState({ level: 2, lapses: 1 });
    const result = applyLevelGrade(state, 'dificil');
    expect(result.level).toBe(2);
    expect(result.lapses).toBe(1);
  });

  it('raises the level by 1 on "acertou"', () => {
    const state = makeState({ level: 1 });
    const result = applyLevelGrade(state, 'acertou');
    expect(result.level).toBe(2);
    expect(result.dueDate).toBe(addDays(today(), 3));
  });

  it('raises the level by 2 on "facil", possibly skipping the next level', () => {
    const state = makeState({ level: 1 });
    const result = applyLevelGrade(state, 'facil');
    expect(result.level).toBe(3);
    expect(result.dueDate).toBe(addDays(today(), 7));
  });

  it('never raises the level above 5', () => {
    const state = makeState({ level: 4 });
    const result = applyLevelGrade(state, 'facil');
    expect(result.level).toBe(5);
    expect(result.dueDate).toBe(addDays(today(), 90));
  });

  it('does not increment lapses on a non-"errei" grade', () => {
    const state = makeState({ level: 0, lapses: 2 });
    const result = applyLevelGrade(state, 'acertou');
    expect(result.lapses).toBe(2);
  });

  it('stamps lastReviewed with today', () => {
    const state = makeState({ level: 1 });
    const result = applyLevelGrade(state, 'acertou');
    expect(result.lastReviewed).toBe(today());
  });

  it('stamps lastGrade with the grade that was given', () => {
    const state = makeState({ level: 1 });
    const result = applyLevelGrade(state, 'acertou');
    expect(result.lastGrade).toBe('acertou');
  });

  it('overwrites a previous lastGrade even when the level does not change', () => {
    const state = makeState({ level: 2, lastGrade: 'facil' });
    const result = applyLevelGrade(state, 'dificil');
    expect(result.lastGrade).toBe('dificil');
  });
});

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween(today(), today())).toBe(0);
  });

  it('returns a positive count when the second date is later', () => {
    expect(daysBetween(today(), addDays(today(), 3))).toBe(3);
  });

  it('returns a negative count when the second date is earlier', () => {
    expect(daysBetween(today(), addDays(today(), -2))).toBe(-2);
  });
});
