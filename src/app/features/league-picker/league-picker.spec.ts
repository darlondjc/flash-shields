import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { LeaguePicker } from './league-picker';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { LeagueService } from '../../core/leagues/league.service';
import { League } from '../../core/models/league.model';

describe('LeaguePicker', () => {
  let fixture: ComponentFixture<LeaguePicker>;
  let importSpy: { importLeague: ReturnType<typeof vi.fn>; progress: ReturnType<typeof signal> };
  let deckServiceSpy: { listDecks: ReturnType<typeof vi.fn>; createLeagueDeck: ReturnType<typeof vi.fn> };
  let leagueServiceSpy: { getLeague: ReturnType<typeof vi.fn> };

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

    await TestBed.configureTestingModule({
      imports: [LeaguePicker],
      providers: [
        provideRouter([]),
        { provide: ImportService, useValue: importSpy },
        { provide: DeckService, useValue: deckServiceSpy },
        { provide: LeagueService, useValue: leagueServiceSpy },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LeaguePicker);
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
});
