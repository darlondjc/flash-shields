import 'fake-indexeddb/auto';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Stats } from './stats';
import { DbService } from '../../core/persistence/db.service';
import { Deck } from '../../core/models/deck.model';
import { Session } from '../../core/models/session.model';
import { League } from '../../core/models/league.model';

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
    await db.leagues.clear();
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

  it('shows the league badge on the deck row when the deck\'s league is known', async () => {
    const league: League = {
      id: 'ts-4328',
      externalIds: { thesportsdb: '4328' },
      name: 'Premier League',
      country: 'England',
      regionId: 'europe',
      sport: 'soccer',
      // No badgeUrl: LeagueBadge skips fetching without one, so this test can
      // assert the icon slot renders without also mocking HttpClient.
    };
    await db.leagues.put(league);
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
    expect(deckRow.querySelector('.deck-accuracy-row__badge')).toBeTruthy();
  });

  it('shows a proper Portuguese label for reverse mode, not the raw "reverse" value', async () => {
    const session: Session = {
      id: 'sess-1',
      deckId: 'deck-1',
      mode: 'reverse',
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

    const modeRow = fixture.nativeElement.querySelector('[data-testid="mode-streak"]');
    expect(modeRow.textContent).toContain('Reverso');
    expect(modeRow.textContent).not.toContain('reverse');
  });

  it('shows Estudo as the mode label for study sessions in best streak', async () => {
    const session: Session = {
      id: 'sess-1',
      deckId: 'deck-1',
      mode: 'study',
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

    const modeRow = fixture.nativeElement.querySelector('[data-testid="mode-streak"]');
    expect(modeRow.textContent).toContain('Estudo');
  });

  it('lists past study sessions with date, card count and accuracy', async () => {
    const startedAt = new Date('2026-07-20T10:00:00Z').toISOString();
    const session: Session = {
      id: 'sess-study-1',
      deckId: 'deck-1',
      mode: 'study',
      startedAt,
      endedAt: new Date('2026-07-20T10:05:00Z').toISOString(),
      answers: [
        { teamId: 't1', correct: true, responseMs: 1000, answeredAt: startedAt },
        { teamId: 't2', correct: false, responseMs: 1000, answeredAt: startedAt },
      ],
      score: 1,
    };
    await db.sessions.put(session);

    fixture = TestBed.createComponent(Stats);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-testid="study-session"]');
    expect(row.textContent).toContain('2 cartas');
    expect(row.textContent).toContain('50%');
  });

  it('shows a message instead of the study history when no study session exists yet', async () => {
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

    expect(fixture.nativeElement.textContent).toContain('Nenhuma sessão de estudo registrada ainda');
    expect(fixture.nativeElement.querySelector('[data-testid="review-heatmap"]')).toBeFalsy();
  });

  it('renders a heatmap cell for every day once a study session exists', async () => {
    const session: Session = {
      id: 'sess-study-1',
      deckId: 'deck-1',
      mode: 'study',
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

    const heatmap = fixture.nativeElement.querySelector('[data-testid="review-heatmap"]');
    expect(heatmap.querySelectorAll('.heatmap__cell').length).toBe(90);
  });
});
