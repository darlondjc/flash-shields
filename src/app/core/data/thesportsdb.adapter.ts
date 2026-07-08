import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DataSourceAdapter, ImportedTeam } from './data-source.adapter';

interface TheSportsDbTeam {
  idTeam: string;
  strTeam: string;
  strTeamShort: string | null;
  strAlternate: string | null;
  strCountry: string | null;
  strBadge: string | null;
  intFormedYear: string | null;
}

interface TheSportsDbTeamsResponse {
  teams: TheSportsDbTeam[] | null;
}

interface TheSportsDbLeague {
  idLeague: string;
  strBadge: string | null;
}

interface TheSportsDbLeagueResponse {
  leagues: TheSportsDbLeague[] | null;
}

const BASE_URL = 'https://www.thesportsdb.com/api/v1/json';

@Injectable({ providedIn: 'root' })
export class TheSportsDbAdapter implements DataSourceAdapter {
  readonly sourceId = 'thesportsdb';
  private http = inject(HttpClient);

  async fetchTeamsForLeague(externalLeagueId: string): Promise<ImportedTeam[]> {
    const url = `${BASE_URL}/${environment.theSportsDbApiKey}/lookup_all_teams.php`;
    const response = await firstValueFrom(
      this.http.get<TheSportsDbTeamsResponse>(url, { params: { id: externalLeagueId } }),
    );
    return (response.teams ?? []).map(mapTeam);
  }

  async fetchLeagueBadge(externalLeagueId: string): Promise<string | undefined> {
    const url = `${BASE_URL}/${environment.theSportsDbApiKey}/lookupleague.php`;
    const response = await firstValueFrom(
      this.http.get<TheSportsDbLeagueResponse>(url, { params: { id: externalLeagueId } }),
    );
    return response.leagues?.[0]?.strBadge ?? undefined;
  }
}

function mapTeam(team: TheSportsDbTeam): ImportedTeam {
  return {
    externalId: team.idTeam,
    name: team.strTeam,
    shortName: team.strTeamShort ?? undefined,
    alternateNames: team.strAlternate
      ? team.strAlternate.split(',').map(name => name.trim()).filter(Boolean)
      : [],
    country: team.strCountry ?? '',
    badgeUrl: team.strBadge ?? '',
    founded: team.intFormedYear ? Number(team.intFormedYear) : undefined,
  };
}
