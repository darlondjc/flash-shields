import { currentSeason } from './season';

describe('currentSeason', () => {
  it('uses a single calendar year for south-america leagues', () => {
    expect(currentSeason('south-america', new Date(2026, 6, 10))).toBe('2026');
  });

  it('uses a single calendar year for north-america leagues', () => {
    expect(currentSeason('north-america', new Date(2026, 6, 10))).toBe('2026');
  });

  it('uses the current-next year span for europe leagues from July onward', () => {
    expect(currentSeason('europe', new Date(2026, 6, 10))).toBe('2026-2027');
  });

  it('uses the previous-current year span for europe leagues before July', () => {
    expect(currentSeason('europe', new Date(2026, 2, 10))).toBe('2025-2026');
  });
});
