import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Home } from './home';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { League } from '../../core/models/league.model';

describe('Home', () => {
  let fixture: ComponentFixture<Home>;
  let importSpy: { importLeague: ReturnType<typeof vi.fn>; progress: ReturnType<typeof signal> };
  let deckServiceSpy: { listDecks: ReturnType<typeof vi.fn>; createLeagueDeck: ReturnType<typeof vi.fn> };

  const league: League = {
    id: 'ts-4328',
    externalIds: {},
    name: 'Premier League',
    country: 'England',
    regionId: 'europe',
    sport: 'soccer',
  };

  beforeEach(async () => {
    importSpy = { importLeague: vi.fn(), progress: signal(null) };
    deckServiceSpy = { listDecks: vi.fn().mockResolvedValue([]), createLeagueDeck: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideRouter([]),
        { provide: ImportService, useValue: importSpy },
        { provide: DeckService, useValue: deckServiceSpy },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Home);
  });

  it('lists the configured leagues with an import button when no deck exists yet', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const importButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="import"]');
    expect(importButton).toBeTruthy();
    expect(importButton.textContent).toContain('Premier League');
  });

  it('importing a league creates its deck and shows study/game links', async () => {
    const newDeck = {
      id: 'deck-league-ts-4328',
      name: 'Premier League',
      scope: { kind: 'league' as const, leagueId: 'ts-4328' },
      teamIds: ['ts-1'],
      createdAt: new Date().toISOString(),
    };
    importSpy.importLeague.mockResolvedValue(league);
    deckServiceSpy.createLeagueDeck.mockResolvedValue(newDeck);
    // The component's constructor (which calls refreshDecks() -> listDecks()) already ran
    // when `fixture = TestBed.createComponent(Home)` executed in beforeEach, above, using the
    // default mockResolvedValue([]) — that call is already spent. The only listDecks() call
    // still pending at this point is the one inside refreshDecks() after import completes, so
    // a single mockResolvedValueOnce covers it; the default mockResolvedValue([]) still backs
    // the earlier (already-consumed) constructor call.
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const importButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="import"]');
    importButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(importSpy.importLeague).toHaveBeenCalled();
    expect(deckServiceSpy.createLeagueDeck).toHaveBeenCalledWith(league);
    const studyLink = fixture.nativeElement.querySelector('[data-testid="study-link"]');
    expect(studyLink).toBeTruthy();
  });

  it('always shows a link to the stats page', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const statsLink = fixture.nativeElement.querySelector('[data-testid="stats-link"]');
    expect(statsLink).toBeTruthy();
  });

  it('always shows an enabled link to settings', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const settingsLink: HTMLAnchorElement = fixture.nativeElement.querySelector('[data-testid="settings-link"]');
    expect(settingsLink).toBeTruthy();
    expect(settingsLink.hasAttribute('disabled')).toBe(false);
  });
});
