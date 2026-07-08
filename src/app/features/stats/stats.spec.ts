import 'fake-indexeddb/auto';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Stats } from './stats';
import { DbService } from '../../core/persistence/db.service';
import { Deck } from '../../core/models/deck.model';
import { Session } from '../../core/models/session.model';

describe('Stats', () => {
  let fixture: ComponentFixture<Stats>;
  let db: DbService;

  const deck: Deck = {
    id: 'deck-1',
    name: 'Premier League',
    scope: { kind: 'league', leagueId: 'ts-4328' },
    teamIds: [],
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Stats],
      providers: [provideRouter([])],
    }).compileComponents();
    db = TestBed.inject(DbService);
    await db.sessions.clear();
    await db.decks.clear();
    await db.decks.put(deck);
  });

  it('shows the empty state when there are no sessions', async () => {
    fixture = TestBed.createComponent(Stats);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyState?.textContent).toContain('Nenhuma partida ainda');
  });

  it('shows aggregated numbers when sessions exist', async () => {
    const session: Session = {
      id: 'sess-1',
      deckId: 'deck-1',
      mode: 'multiple-choice',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      answers: [{ teamId: 't1', correct: true, responseMs: 1000, answeredAt: new Date().toISOString() }],
      score: 1,
    };
    await db.sessions.put(session);

    fixture = TestBed.createComponent(Stats);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const deckRow = fixture.nativeElement.querySelector('[data-testid="deck-accuracy"]');
    expect(deckRow.textContent).toContain('Premier League');
    expect(deckRow.textContent).toContain('100%');
  });
});
