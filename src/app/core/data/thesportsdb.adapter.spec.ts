import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TheSportsDbAdapter, THESPORTSDB_MIN_REQUEST_INTERVAL_MS } from './thesportsdb.adapter';

// O adapter serializa toda chamada (rodadas e buscas de time), com um
// espaçamento mínimo entre elas pra respeitar o limite de taxa da API real —
// zerado aqui para os testes não ficarem lentos de verdade. Cada .flush()
// só libera a próxima requisição depois que o event loop roda mais um tick,
// daí o tick() entre cada chamada abaixo.
function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('TheSportsDbAdapter', () => {
  let adapter: TheSportsDbAdapter;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: THESPORTSDB_MIN_REQUEST_INTERVAL_MS, useValue: 0 },
      ],
    });
    adapter = TestBed.inject(TheSportsDbAdapter);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  async function flushRoundsDiscovering(teamsInRound1: { strHomeTeam: string; strAwayTeam: string | null }[]) {
    const round1 = httpMock.expectOne(
      req => req.url.includes('eventsround.php') && req.params.get('r') === '1',
    );
    round1.flush({ events: teamsInRound1 });
    await tick();

    for (const round of [2, 3, 4]) {
      httpMock
        .expectOne(req => req.url.includes('eventsround.php') && req.params.get('r') === String(round))
        .flush({ events: [] });
      await tick();
    }
  }

  it('discovers teams by scanning rounds, then fetches each team individually', async () => {
    const promise = adapter.fetchTeamsForLeague('4328', '2025-2026');

    const round1 = httpMock.expectOne(
      req => req.url.includes('eventsround.php') && req.params.get('id') === '4328' && req.params.get('r') === '1',
    );
    expect(round1.request.params.get('s')).toBe('2025-2026');
    round1.flush({ events: [{ strHomeTeam: 'Arsenal', strAwayTeam: 'Chelsea' }] });
    await tick();

    // Rodadas 2-4 não trazem times novos, então depois de 3 rodadas seguidas
    // sem novidade a varredura para.
    for (const round of [2, 3, 4]) {
      httpMock
        .expectOne(req => req.url.includes('eventsround.php') && req.params.get('r') === String(round))
        .flush({ events: [{ strHomeTeam: 'Arsenal', strAwayTeam: 'Chelsea' }] });
      await tick();
    }

    // Buscas de time são sequenciais (não em paralelo), pra respeitar o
    // espaçamento entre chamadas — então cada uma é resolvida por vez.
    for (const name of ['Arsenal', 'Chelsea']) {
      const req = httpMock.expectOne(r => r.url.includes('searchteams.php') && r.params.get('t') === name);
      req.flush({
        teams: [
          {
            idTeam: name === 'Arsenal' ? '133604' : '133610',
            strTeam: name,
            strTeamShort: name,
            strTeamAlternate: name === 'Arsenal' ? 'Arsenal FC, The Gunners' : null,
            strCountry: 'England',
            strBadge: `https://r2.thesportsdb.com/images/media/team/badge/${name}.png`,
            intFormedYear: '1886',
            idLeague: '4328',
          },
        ],
      });
      await tick();
    }

    const result = await promise;
    expect(result.map(team => team.name).sort()).toEqual(['Arsenal', 'Chelsea']);
    const arsenal = result.find(team => team.name === 'Arsenal');
    expect(arsenal?.alternateNames).toEqual(['Arsenal FC', 'The Gunners']);
    expect(arsenal?.founded).toBe(1886);
  });

  it('stops scanning rounds early once no new team appears for a few rounds in a row', async () => {
    const promise = adapter.fetchTeamsForLeague('4328', '2025-2026');

    await flushRoundsDiscovering([{ strHomeTeam: 'Arsenal', strAwayTeam: 'Chelsea' }]);

    // Não deve ter feito uma 5ª chamada de rodada.
    httpMock.expectNone(req => req.url.includes('eventsround.php') && req.params.get('r') === '5');

    for (const name of ['Arsenal', 'Chelsea']) {
      httpMock.expectOne(r => r.url.includes('searchteams.php') && r.params.get('t') === name).flush({ teams: [] });
      await tick();
    }

    await promise;
  });

  it('when a team name collides across countries, prefers the result scoped to the league being imported', async () => {
    const promise = adapter.fetchTeamsForLeague('4351', '2026');

    await flushRoundsDiscovering([{ strHomeTeam: 'América', strAwayTeam: null }]);

    httpMock.expectOne(req => req.url.includes('searchteams.php') && req.params.get('t') === 'América').flush({
      teams: [
        { idTeam: '1', strTeam: 'América', strTeamShort: null, strTeamAlternate: null, strCountry: 'Mexico', strBadge: '', intFormedYear: null, idLeague: '4350' },
        { idTeam: '2', strTeam: 'América', strTeamShort: null, strTeamAlternate: null, strCountry: 'Brazil', strBadge: '', intFormedYear: null, idLeague: '4351' },
      ],
    });

    const result = await promise;
    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe('2');
    expect(result[0].country).toBe('Brazil');
  });

  it('returns an empty array when the league has no rounds/teams at all', async () => {
    const promise = adapter.fetchTeamsForLeague('0', '2025-2026');

    for (const round of [1, 2, 3]) {
      httpMock
        .expectOne(req => req.url.includes('eventsround.php') && req.params.get('r') === String(round))
        .flush({ events: null });
      await tick();
    }

    expect(await promise).toEqual([]);
  });

  it('fetches the league badge URL', async () => {
    const promise = adapter.fetchLeagueDetails('4328');

    const req = httpMock.expectOne(req => req.url.includes('lookupleague.php') && req.params.get('id') === '4328');
    req.flush({
      leagues: [
        {
          idLeague: '4328',
          strLeague: 'English Premier League',
          strBadge: 'https://r2.thesportsdb.com/images/media/league/badge/premier.png',
        },
      ],
    });

    expect(await promise).toEqual({
      badgeUrl: 'https://r2.thesportsdb.com/images/media/league/badge/premier.png',
    });
  });

  it('returns an empty details object when the league lookup has no match', async () => {
    const promise = adapter.fetchLeagueDetails('0');
    httpMock.expectOne(req => req.url.includes('lookupleague.php')).flush({ leagues: null });
    expect(await promise).toEqual({ badgeUrl: undefined });
  });
});
