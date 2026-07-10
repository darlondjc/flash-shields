import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AppInitService } from './app-init.service';
import { ImportService } from './import.service';
import { DeckService } from '../decks/deck.service';
import { LeagueService } from '../leagues/league.service';
import { DbService } from '../persistence/db.service';
import { League } from '../models/league.model';
import { Deck } from '../models/deck.model';

// vi.mock() of relative imports is unsupported under the Angular unit-test
// builder, so badge warming is observed through the same seam badge-warmer
// itself uses: a stubbed global Image that records each requested URL and
// "loads" immediately.
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  static requestedUrls: string[] = [];

  set src(value: string) {
    FakeImage.requestedUrls.push(value);
    queueMicrotask(() => this.onload?.());
  }
}

describe('AppInitService', () => {
  const originalImage = globalThis.Image;
  let service: AppInitService;
  let importServiceSpy: { importLeagues: ReturnType<typeof vi.fn> };
  let deckServiceSpy: { getDeck: ReturnType<typeof vi.fn> };
  let leagueServiceSpy: { getLeague: ReturnType<typeof vi.fn>; listLeagues: ReturnType<typeof vi.fn> };
  let dbSpy: { teams: { toArray: ReturnType<typeof vi.fn> } };

  const readyLeague: League = {
    id: 'ts-4328',
    externalIds: {},
    name: 'Premier League',
    country: 'Inglaterra',
    regionId: 'europe',
    sport: 'soccer',
    badgeUrl: 'https://example.com/pl.png',
  };
  const readyDeck: Deck = {
    id: 'deck-league-ts-4328',
    name: 'Premier League',
    scope: { kind: 'league', leagueId: 'ts-4328' },
    teamIds: ['ts-4328-1'],
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    FakeImage.requestedUrls = [];
    (globalThis as unknown as { Image: typeof Image }).Image = FakeImage as unknown as typeof Image;

    importServiceSpy = { importLeagues: vi.fn().mockResolvedValue(undefined) };
    deckServiceSpy = { getDeck: vi.fn() };
    leagueServiceSpy = { getLeague: vi.fn(), listLeagues: vi.fn().mockResolvedValue([]) };
    dbSpy = { teams: { toArray: vi.fn().mockResolvedValue([]) } };

    TestBed.configureTestingModule({
      providers: [
        { provide: ImportService, useValue: importServiceSpy },
        { provide: DeckService, useValue: deckServiceSpy },
        { provide: LeagueService, useValue: leagueServiceSpy },
        { provide: DbService, useValue: dbSpy },
      ],
    });
    service = TestBed.inject(AppInitService);
  });

  afterEach(() => {
    globalThis.Image = originalImage;
  });

  it('does nothing when every league already has a league and a deck with teams', async () => {
    leagueServiceSpy.getLeague.mockResolvedValue(readyLeague);
    deckServiceSpy.getDeck.mockResolvedValue(readyDeck);

    await service.run();

    expect(importServiceSpy.importLeagues).not.toHaveBeenCalled();
  });

  it('imports only the leagues missing a league/deck', async () => {
    leagueServiceSpy.getLeague.mockImplementation((id: string) =>
      Promise.resolve(id === 'ts-4328' ? readyLeague : undefined),
    );
    deckServiceSpy.getDeck.mockImplementation((id: string) =>
      Promise.resolve(id === 'deck-league-ts-4328' ? readyDeck : undefined),
    );

    await service.run();

    expect(importServiceSpy.importLeagues).toHaveBeenCalledTimes(1);
    const [configs] = importServiceSpy.importLeagues.mock.calls[0];
    expect(configs.some((config: { externalId: string }) => config.externalId === '4328')).toBe(false);
    expect(configs.length).toBeGreaterThan(0);
  });

  it('warms the badge cache for every league and team after importing', async () => {
    leagueServiceSpy.getLeague.mockResolvedValue(undefined);
    deckServiceSpy.getDeck.mockResolvedValue(undefined);
    leagueServiceSpy.listLeagues.mockResolvedValue([readyLeague]);
    dbSpy.teams.toArray.mockResolvedValue([{ id: 'ts-4328-1', badgeUrl: 'https://example.com/arsenal.png' }]);

    await service.run();

    expect(FakeImage.requestedUrls).toContain('https://example.com/arsenal.png');
    expect(FakeImage.requestedUrls).toContain('https://example.com/pl.png');
  });

  it('never warms badges when everything was already ready', async () => {
    leagueServiceSpy.getLeague.mockResolvedValue(readyLeague);
    deckServiceSpy.getDeck.mockResolvedValue(readyDeck);

    await service.run();

    expect(FakeImage.requestedUrls).toEqual([]);
  });
});
