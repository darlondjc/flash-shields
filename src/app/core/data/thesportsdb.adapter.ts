import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DataSourceAdapter, ImportedTeam, LeagueDetails } from './data-source.adapter';

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
  strLeague: string | null;
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

  async fetchTeamsForLeague(leagueName: string): Promise<ImportedTeam[]> {
    // lookup_all_teams.php?id= ignora o id com a chave de teste gratuita e
    // sempre devolve a mesma amostra fixa de times. search_all_teams.php?l=
    // filtra corretamente pelo nome canônico da liga (strLeague).
    const url = `${BASE_URL}/${environment.theSportsDbApiKey}/search_all_teams.php`;
    const response = await firstValueFrom(
      this.http.get<TheSportsDbTeamsResponse>(url, { params: { l: leagueName } }),
    );
    return (response.teams ?? []).map(mapTeam);
  }

  async fetchLeagueDetails(externalLeagueId: string): Promise<LeagueDetails> {
    const url = `${BASE_URL}/${environment.theSportsDbApiKey}/lookupleague.php`;
    const response = await firstValueFrom(
      this.http.get<TheSportsDbLeagueResponse>(url, { params: { id: externalLeagueId } }),
    );
    const league = response.leagues?.[0];
    return { name: league?.strLeague ?? undefined, badgeUrl: league?.strBadge ?? undefined };
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
