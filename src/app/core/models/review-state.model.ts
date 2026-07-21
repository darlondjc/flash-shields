export type ReviewGrade = 'errei' | 'dificil' | 'acertou' | 'facil';

export interface ReviewState {
  teamId: string;
  deckId: string;
  level: number;
  dueDate: string;
  lastReviewed?: string;
  lapses: number;
  suspended: boolean;
}
