export type GameMode = 'multiple-choice';

export interface SessionAnswer {
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
