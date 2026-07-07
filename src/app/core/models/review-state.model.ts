export type ReviewQuality = 0 | 3 | 4 | 5;

export interface ReviewState {
  teamId: string;
  deckId: string;
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  dueDate: string;
  lastReviewed?: string;
  lapses: number;
  suspended: boolean;
}
