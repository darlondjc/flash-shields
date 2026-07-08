import { Injectable, inject } from '@angular/core';
import { DbService } from '../persistence/db.service';
import { GameMode, Session, SessionAnswer } from '../models/session.model';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private db = inject(DbService);

  async finish(
    deckId: string,
    mode: GameMode,
    answers: SessionAnswer[],
    startedAt: string,
  ): Promise<Session> {
    const session: Session = {
      id: crypto.randomUUID(),
      deckId,
      mode,
      startedAt,
      endedAt: new Date().toISOString(),
      answers,
      score: answers.filter(answer => answer.correct).length,
    };
    await this.db.sessions.put(session);
    return session;
  }
}
