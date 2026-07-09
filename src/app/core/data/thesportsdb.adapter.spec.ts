import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TheSportsDbAdapter } from './thesportsdb.adapter';

describe('TheSportsDbAdapter', () => {
  let adapter: TheSportsDbAdapter;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    adapter = TestBed.inject(TheSportsDbAdapter);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('maps TheSportsDB teams into ImportedTeam records', async () => {
    const promise = adapter.fetchTeamsForLeague('English Premier League');

    const req = httpMock.expectOne(
      req => req.url.includes('search_all_teams.php') && req.params.get('l') === 'English Premier League',
    );
    req.flush({
      teams: [
        {
          idTeam: '133604',
          strTeam: 'Arsenal',
          strTeamShort: 'Arsenal',
          strAlternate: 'Arsenal FC, The Gunners',
          strCountry: 'England',
          strBadge: 'https://r2.thesportsdb.com/images/media/team/badge/arsenal.png',
          intFormedYear: '1886',
        },
      ],
    });

    const result = await promise;
    expect(result).toEqual([
      {
        externalId: '133604',
        name: 'Arsenal',
        shortName: 'Arsenal',
        alternateNames: ['Arsenal FC', 'The Gunners'],
        country: 'England',
        badgeUrl: 'https://r2.thesportsdb.com/images/media/team/badge/arsenal.png',
        founded: 1886,
      },
    ]);
  });

  it('returns an empty array when the league has no teams', async () => {
    const promise = adapter.fetchTeamsForLeague('Unknown League');
    httpMock.expectOne(req => req.url.includes('search_all_teams.php')).flush({ teams: null });
    expect(await promise).toEqual([]);
  });

  it('fetches the league name and badge URL', async () => {
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
      name: 'English Premier League',
      badgeUrl: 'https://r2.thesportsdb.com/images/media/league/badge/premier.png',
    });
  });

  it('returns an empty details object when the league lookup has no match', async () => {
    const promise = adapter.fetchLeagueDetails('0');
    httpMock.expectOne(req => req.url.includes('lookupleague.php')).flush({ leagues: null });
    expect(await promise).toEqual({ name: undefined, badgeUrl: undefined });
  });
});
