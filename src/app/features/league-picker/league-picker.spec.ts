import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { LeaguePicker } from './league-picker';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { LeagueService } from '../../core/leagues/league.service';
import { SrsService } from '../../core/srs/srs.service';
import { today, addDays } from '../../core/srs/level';
import { League } from '../../core/models/league.model';

describe('LeaguePicker', () => {
  let fixture: ComponentFixture<LeaguePicker>;
  let importSpy: { importLeague: ReturnType<typeof vi.fn>; progress: ReturnType<typeof signal> };
  let deckServiceSpy: { listDecks: ReturnType<typeof vi.fn>; createLeagueDeck: ReturnType<typeof vi.fn> };
  let leagueServiceSpy: { getLeague: ReturnType<typeof vi.fn> };
  let srsServiceSpy: { getDeckSummary: ReturnType<typeof vi.fn> };

  const league: League = {
    id: 'ts-4328',
    externalIds: {},
    name: 'Premier League',
    country: 'Inglaterra',
    regionId: 'europe',
    sport: 'soccer',
  };

  const newDeck = {
    id: 'deck-league-ts-4328',
    name: 'Premier League',
    scope: { kind: 'league' as const, leagueId: 'ts-4328' },
    teamIds: ['ts-1'],
    createdAt: new Date().toISOString(),
  };

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // Mirrors home.spec.ts's click sequencing: detectChanges() must not run
  // between the click and whenStable(), otherwise (in zoneless mode) the app
  // reports stable before the async click handler's promise chain finishes.
  async function selectFirstLeague() {
    await settle();
    fixture.nativeElement.querySelector('[data-testid="select-country"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="select-league"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    importSpy = { importLeague: vi.fn().mockResolvedValue(league), progress: signal(null) };
    deckServiceSpy = {
      listDecks: vi.fn().mockResolvedValue([]),
      createLeagueDeck: vi.fn().mockResolvedValue(newDeck),
    };
    leagueServiceSpy = { getLeague: vi.fn().mockResolvedValue(undefined) };
    srsServiceSpy = {
      getDeckSummary: vi.fn().mockResolvedValue({
        memorizedCount: 0,
        toRevisitCount: 0,
        lastStudiedAt: null,
        nextStudyAvailable: true,
        nextStudyDueDate: null,
      }),
    };

    await TestBed.configureTestingModule({
      imports: [LeaguePicker],
      providers: [
        provideRouter([]),
        { provide: ImportService, useValue: importSpy },
        { provide: DeckService, useValue: deckServiceSpy },
        { provide: LeagueService, useValue: leagueServiceSpy },
        { provide: SrsService, useValue: srsServiceSpy },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LeaguePicker);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows country selection cards first', async () => {
    await settle();
    expect(fixture.nativeElement.querySelector('[data-testid="select-country"]')).toBeTruthy();
  });

  it('with actions=["study"], shows only the study link after importing a league', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    fixture.componentRef.setInput('actions', ['study']);

    await selectFirstLeague();

    expect(fixture.nativeElement.querySelector('[data-testid="study-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="game-link"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="reverse-link"]')).toBeFalsy();
  });

  it('with actions=["play","reverse"], shows only the game/reverse links after importing a league', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    fixture.componentRef.setInput('actions', ['play', 'reverse']);

    await selectFirstLeague();

    expect(fixture.nativeElement.querySelector('[data-testid="study-link"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="game-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="reverse-link"]')).toBeTruthy();
  });

  it('restores the last selected league from localStorage when there is no ?league query param', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    localStorage.setItem('flash-shields:last-league:study', '4328');
    fixture.componentRef.setInput('actions', ['study']);

    await settle();

    expect(fixture.nativeElement.querySelector('[data-testid="select-country"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="study-link"]')).toBeTruthy();
  });

  it('prefers the ?league query param over localStorage when both are set', async () => {
    localStorage.setItem('flash-shields:last-league:study', '4335');
    // This test builds its own fixture below (construction happens AFTER
    // this line), unlike the other tests which reuse the outer `fixture`
    // built in `beforeEach` (construction happens BEFORE their mock setup).
    // That reversed ordering means the constructor's own `refreshDecks()`
    // call — not just the effect's — can consume a queued `mockResolvedValueOnce`
    // here, so use a persistent `mockResolvedValue` instead: every call
    // (constructor's and the effect's) then returns the same deck regardless
    // of call order.
    deckServiceSpy.listDecks.mockResolvedValue([newDeck]);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [LeaguePicker],
      providers: [
        provideRouter([]),
        { provide: ImportService, useValue: importSpy },
        { provide: DeckService, useValue: deckServiceSpy },
        { provide: LeagueService, useValue: leagueServiceSpy },
        { provide: SrsService, useValue: srsServiceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ league: '4328' }) } } },
      ],
    }).compileComponents();

    const queryParamFixture = TestBed.createComponent(LeaguePicker);
    queryParamFixture.componentRef.setInput('actions', ['study']);
    queryParamFixture.detectChanges();
    await queryParamFixture.whenStable();
    queryParamFixture.detectChanges();

    expect(queryParamFixture.nativeElement.querySelector('[data-testid="study-link"]')).toBeTruthy();
  });

  it('remembers the selected league in localStorage under a key scoped to the current actions', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    fixture.componentRef.setInput('actions', ['study']);

    await selectFirstLeague();

    expect(localStorage.getItem('flash-shields:last-league:study')).toBe('4328');
    expect(localStorage.getItem('flash-shields:last-league:play-reverse')).toBeNull();
  });

  it('shows the study summary card only when the study action is present', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    srsServiceSpy.getDeckSummary.mockResolvedValueOnce({
      memorizedCount: 5,
      toRevisitCount: 2,
      lastStudiedAt: null,
      nextStudyAvailable: true,
      nextStudyDueDate: null,
    });
    fixture.componentRef.setInput('actions', ['study']);

    await selectFirstLeague();

    expect(fixture.nativeElement.querySelector('[data-testid="study-summary"]')).toBeTruthy();
  });

  it('hides the study summary card for actions=["play","reverse"]', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    fixture.componentRef.setInput('actions', ['play', 'reverse']);

    await selectFirstLeague();

    expect(fixture.nativeElement.querySelector('[data-testid="study-summary"]')).toBeFalsy();
    expect(srsServiceSpy.getDeckSummary).not.toHaveBeenCalled();
  });

  it('renders the memorized and toRevisit counts as plain numbers', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    srsServiceSpy.getDeckSummary.mockResolvedValueOnce({
      memorizedCount: 12,
      toRevisitCount: 4,
      lastStudiedAt: null,
      nextStudyAvailable: true,
      nextStudyDueDate: null,
    });
    fixture.componentRef.setInput('actions', ['study']);

    await selectFirstLeague();

    const text = fixture.nativeElement.querySelector('[data-testid="study-summary"]').textContent;
    expect(text).toContain('12');
    expect(text).toContain('4');
  });

  it('labels lastStudiedAt as "Nunca" when the deck was never studied', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    srsServiceSpy.getDeckSummary.mockResolvedValueOnce({
      memorizedCount: 0,
      toRevisitCount: 3,
      lastStudiedAt: null,
      nextStudyAvailable: true,
      nextStudyDueDate: null,
    });
    fixture.componentRef.setInput('actions', ['study']);

    await selectFirstLeague();

    expect(fixture.nativeElement.querySelector('[data-testid="study-summary"]').textContent).toContain('Nunca');
  });

  it('labels nextStudy as "Agora" when nextStudyAvailable is true, and as days-out otherwise', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    srsServiceSpy.getDeckSummary.mockResolvedValueOnce({
      memorizedCount: 0,
      toRevisitCount: 0,
      lastStudiedAt: null,
      nextStudyAvailable: false,
      nextStudyDueDate: addDays(today(), 3),
    });
    fixture.componentRef.setInput('actions', ['study']);

    await selectFirstLeague();

    expect(fixture.nativeElement.querySelector('[data-testid="study-summary"]').textContent).toContain('Em 3 dias');
  });
});
