import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Search } from './search';
import { DeckService } from '../../core/decks/deck.service';
import { LeagueService } from '../../core/leagues/league.service';
import { TeamService } from '../../core/leagues/team.service';
import { Deck } from '../../core/models/deck.model';
import { Team } from '../../core/models/team.model';

describe('Search', () => {
  let fixture: ComponentFixture<Search>;
  let deckServiceSpy: { listDecks: ReturnType<typeof vi.fn> };
  let leagueServiceSpy: { getLeague: ReturnType<typeof vi.fn> };
  let teamServiceSpy: { getTeam: ReturnType<typeof vi.fn>; searchByName: ReturnType<typeof vi.fn> };

  const arsenal: Team = {
    id: 'ts-4328-1',
    externalIds: {},
    name: 'Arsenal',
    alternateNames: ['The Gunners'],
    country: 'Inglaterra',
    leagueIds: ['ts-4328'],
    badgeUrl: 'https://example.com/arsenal.png',
    founded: 1886,
  };

  const chelsea: Team = {
    id: 'ts-4328-2',
    externalIds: {},
    name: 'Chelsea',
    alternateNames: ['The Blues'],
    country: 'Inglaterra',
    leagueIds: ['ts-4328'],
    badgeUrl: 'https://example.com/chelsea.png',
    founded: 1905,
  };

  const premierLeagueDeck: Deck = {
    id: 'deck-league-ts-4328',
    name: 'Premier League',
    scope: { kind: 'league', leagueId: 'ts-4328' },
    teamIds: ['ts-4328-1', 'ts-4328-2'],
    createdAt: new Date().toISOString(),
  };

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // Same zoneless caveat as league-picker.spec.ts: after an interaction that
  // kicks off an async handler, whenStable() must run before detectChanges().
  async function interactAndSettle(action: () => void) {
    action();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    deckServiceSpy = { listDecks: vi.fn().mockResolvedValue([premierLeagueDeck]) };
    leagueServiceSpy = { getLeague: vi.fn().mockResolvedValue(undefined) };
    teamServiceSpy = {
      getTeam: vi
        .fn()
        .mockImplementation(async (id: string) => (id === arsenal.id ? arsenal : chelsea)),
      searchByName: vi.fn().mockResolvedValue([arsenal]),
    };

    await TestBed.configureTestingModule({
      imports: [Search],
      providers: [
        provideRouter([]),
        { provide: DeckService, useValue: deckServiceSpy },
        { provide: LeagueService, useValue: leagueServiceSpy },
        { provide: TeamService, useValue: teamServiceSpy },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Search);
  });

  it('shows country cards by default', async () => {
    await settle();
    const countryButton = fixture.nativeElement.querySelector('[data-testid="select-country"]');
    expect(countryButton).toBeTruthy();
    expect(countryButton.textContent).toContain('Inglaterra');
  });

  it('typing a team name filters down to leagues containing a match', async () => {
    await settle();

    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="search-input"]',
    );
    await interactAndSettle(() => {
      input.value = 'Arsenal';
      input.dispatchEvent(new Event('input'));
    });

    expect(teamServiceSpy.searchByName).toHaveBeenCalledWith('Arsenal');
    const leagueButton = fixture.nativeElement.querySelector('[data-testid="select-league"]');
    expect(leagueButton).toBeTruthy();
    expect(leagueButton.textContent).toContain('Premier League');
  });

  it('clicking a league in the search results shows only the teams matching the query', async () => {
    await settle();

    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="search-input"]',
    );
    await interactAndSettle(() => {
      input.value = 'Arsenal';
      input.dispatchEvent(new Event('input'));
    });

    await interactAndSettle(() =>
      fixture.nativeElement.querySelector('[data-testid="select-league"]').click(),
    );

    // The deck has Arsenal and Chelsea, but the grid keeps honoring the query.
    const teamButtons = fixture.nativeElement.querySelectorAll('[data-testid="select-team"]');
    expect(teamButtons.length).toBe(1);
    expect(teamButtons[0].textContent).toContain('Arsenal');
    // The query stays in the box so the active filter is visible and clearable.
    expect(input.value).toBe('Arsenal');
  });

  it('clear button empties the query and reveals the whole open league', async () => {
    await settle();

    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="search-input"]',
    );
    await interactAndSettle(() => {
      input.value = 'Arsenal';
      input.dispatchEvent(new Event('input'));
    });
    await interactAndSettle(() =>
      fixture.nativeElement.querySelector('[data-testid="select-league"]').click(),
    );

    await interactAndSettle(() =>
      fixture.nativeElement.querySelector('[data-testid="clear-search"]').click(),
    );

    expect(input.value).toBe('');
    const teamButtons = fixture.nativeElement.querySelectorAll('[data-testid="select-team"]');
    expect(teamButtons.length).toBe(2);
  });

  it('shows an empty state when no team in the open league matches the query', async () => {
    await settle();

    await interactAndSettle(() =>
      fixture.nativeElement.querySelector('[data-testid="select-country"]').click(),
    );
    await interactAndSettle(() =>
      fixture.nativeElement.querySelector('[data-testid="select-league"]').click(),
    );

    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="search-input"]',
    );
    await interactAndSettle(() => {
      input.value = 'Zebra';
      input.dispatchEvent(new Event('input'));
    });

    expect(fixture.nativeElement.querySelectorAll('[data-testid="select-team"]').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Nenhum time encontrado');
  });

  it('clearing the search box goes back to the country list', async () => {
    await settle();

    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="search-input"]',
    );
    await interactAndSettle(() => {
      input.value = 'Arsenal';
      input.dispatchEvent(new Event('input'));
    });
    // The native ✕ of type=search clears the value and fires input.
    await interactAndSettle(() => {
      input.value = '';
      input.dispatchEvent(new Event('input'));
    });

    expect(fixture.nativeElement.querySelector('[data-testid="select-country"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="select-league"]')).toBeFalsy();
  });

  it('drills down from country to league to a 3-column team grid', async () => {
    await settle();

    await interactAndSettle(() =>
      fixture.nativeElement.querySelector('[data-testid="select-country"]').click(),
    );
    await interactAndSettle(() =>
      fixture.nativeElement.querySelector('[data-testid="select-league"]').click(),
    );

    expect(teamServiceSpy.getTeam).toHaveBeenCalledWith('ts-4328-1');
    const teamButton = fixture.nativeElement.querySelector('[data-testid="select-team"]');
    expect(teamButton).toBeTruthy();
    expect(teamButton.textContent).toContain('Arsenal');
  });

  it('shows team details including calculated age', async () => {
    // Fake only Date (not setTimeout etc.) so whenStable() keeps working.
    // Local-time constructor — an ISO string would parse as UTC and roll back
    // to the previous year in negative-offset timezones.
    vi.useFakeTimers({ now: new Date(2026, 5, 15), toFake: ['Date'] });
    await settle();

    await interactAndSettle(() =>
      fixture.nativeElement.querySelector('[data-testid="select-country"]').click(),
    );
    await interactAndSettle(() =>
      fixture.nativeElement.querySelector('[data-testid="select-league"]').click(),
    );
    await interactAndSettle(() =>
      fixture.nativeElement.querySelector('[data-testid="select-team"]').click(),
    );

    const detail = fixture.nativeElement.querySelector('[data-testid="team-detail"]');
    expect(detail.textContent).toContain('Arsenal');
    expect(detail.textContent).toContain('1886');
    expect(detail.textContent).toContain('140 anos');

    vi.useRealTimers();
  });
});
