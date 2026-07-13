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

  const premierLeagueDeck: Deck = {
    id: 'deck-league-ts-4328',
    name: 'Premier League',
    scope: { kind: 'league', leagueId: 'ts-4328' },
    teamIds: ['ts-4328-1'],
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
      getTeam: vi.fn().mockResolvedValue(arsenal),
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

  it('clicking a league in the search results opens its team grid', async () => {
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

    const teamButton = fixture.nativeElement.querySelector('[data-testid="select-team"]');
    expect(teamButton).toBeTruthy();
    expect(teamButton.textContent).toContain('Arsenal');
    // The results list must give way to the team grid, and the box must be
    // empty so the next search starts fresh.
    expect(fixture.nativeElement.querySelector('[data-testid="search-input"]').value).toBe('');
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
