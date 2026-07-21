export type GameMode = 'multiple-choice' | 'reverse' | 'study';

export interface SessionAnswer {
  // The tested/prompted team (the flashcard being asked about), not the team the user clicked.
  // Correctness of the user's actual pick is captured separately by `correct`.
  teamId: string;
  correct: boolean;
  responseMs: number;
  answeredAt: string;
}

export interface Session {
  id: string;
  deckId: string;
  mode: GameMode;
  startedAt: string;
  endedAt?: string;
  answers: SessionAnswer[];
  score?: number;
}
