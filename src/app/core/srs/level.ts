import { ReviewState, ReviewGrade } from '../models/review-state.model';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const LEVEL_INTERVAL_DAYS = [0, 1, 3, 7, 30, 90];
const MAX_LEVEL = LEVEL_INTERVAL_DAYS.length - 1;

const LEVEL_DELTA: Record<ReviewGrade, number> = {
  errei: -1,
  dificil: 0,
  acertou: 1,
  facil: 2,
};

function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(0, level));
}

export function applyLevelGrade(state: ReviewState, grade: ReviewGrade): ReviewState {
  const level = clampLevel(state.level + LEVEL_DELTA[grade]);
  return {
    ...state,
    level,
    lapses: grade === 'errei' ? state.lapses + 1 : state.lapses,
    dueDate: addDays(today(), LEVEL_INTERVAL_DAYS[level]),
    lastReviewed: today(),
  };
}
