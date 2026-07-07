import { ReviewState, ReviewQuality } from '../models/review-state.model';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function applySm2(state: ReviewState, quality: ReviewQuality): ReviewState {
  let { repetitions, easeFactor, intervalDays } = state;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
    return {
      ...state,
      repetitions,
      intervalDays,
      lapses: state.lapses + 1,
      dueDate: addDays(today(), 1),
      lastReviewed: today(),
    };
  }

  repetitions += 1;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 6;
  else intervalDays = Math.round(intervalDays * easeFactor);

  easeFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  return {
    ...state,
    repetitions,
    easeFactor,
    intervalDays,
    dueDate: addDays(today(), intervalDays),
    lastReviewed: today(),
  };
}
