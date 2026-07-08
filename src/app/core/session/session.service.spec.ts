import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';
import { DbService } from '../persistence/db.service';
import { SessionAnswer } from '../models/session.model';

function makeAnswer(overrides: Partial<SessionAnswer> = {}): SessionAnswer {
  return {
    teamId: 'ts-1',
    correct: true,
    responseMs: 1200,
    answeredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('SessionService', () => {
  let service: SessionService;
  let db: DbService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SessionService);
    db = TestBed.inject(DbService);
    await db.sessions.clear();
  });

  it('persists a session with a computed score', async () => {
    const answers = [makeAnswer({ correct: true }), makeAnswer({ correct: false })];
    const startedAt = new Date().toISOString();

    const session = await service.finish('deck-1', 'multiple-choice', answers, startedAt);

    expect(session.deckId).toBe('deck-1');
    expect(session.mode).toBe('multiple-choice');
    expect(session.answers).toEqual(answers);
    expect(session.score).toBe(1);
    expect(session.endedAt).toBeTruthy();

    const stored = await db.sessions.get(session.id);
    expect(stored?.score).toBe(1);
  });

  it('computes a score of 0 when there are no correct answers', async () => {
    const session = await service.finish(
      'deck-1',
      'multiple-choice',
      [makeAnswer({ correct: false })],
      new Date().toISOString(),
    );
    expect(session.score).toBe(0);
  });
});
