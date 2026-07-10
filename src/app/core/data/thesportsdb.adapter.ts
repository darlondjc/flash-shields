import { Injectable, InjectionToken, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DataSourceAdapter, ImportedTeam, LeagueDetails } from './data-source.adapter';

interface TheSportsDbTeam {
  idTeam: string;
  strTeam: string;
  strTeamShort: string | null;
  // O campo de nomes alternativos da API se chama strTeamAlternate — não
  // existe strAlternate (confirmado contra a API real; um código anterior
  // lia o campo errado e "nomes alternativos" nunca vinha preenchido).
  strTeamAlternate: string | null;
  strCountry: string | null;
  strBadge: string | null;
  intFormedYear: string | null;
  idLeague: string | null;
  strStadium: string | null;
  strWebsite: string | null;
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

interface TheSportsDbEvent {
  strHomeTeam: string | null;
  strAwayTeam: string | null;
}

interface TheSportsDbEventsResponse {
  events: TheSportsDbEvent[] | null;
}

const BASE_URL = 'https://www.thesportsdb.com/api/v1/json';

// search_all_teams.php?l=<nome da liga> corta o resultado em 10 times mesmo
// quando a liga tem mais elenco (limite da chave de teste gratuita, testado
// contra a API real com times de verdade — não é algo que dá pra contornar
// trocando de chave). eventsround.php não tem esse corte por liga: cada
// rodada devolve seus próprios jogos, e times diferentes aparecem em rodadas
// diferentes, então iterar rodadas descobre o elenco completo. Times
// individuais são então buscados via searchteams.php?t=<nome>, que também não
// tem esse corte por ser uma busca por time, não por liga.
const MAX_ROUNDS_TO_SCAN = 40;
const ROUNDS_WITHOUT_NEW_TEAM_TO_STOP = 3;

// O plano gratuito da TheSportsDB permite 30 requisições/minuto (confirmado:
// ultrapassar isso devolve 429 too_many_requests). Descobrir o elenco
// completo de uma liga já soma umas 30 chamadas sozinho (rodadas + 1 busca
// por time), então todo request passa por aqui pra nunca sair mais rápido que
// esse limite — o import inicial fica mais lento, mas não quebra.
export const THESPORTSDB_MIN_REQUEST_INTERVAL_MS = new InjectionToken<number>(
  'THESPORTSDB_MIN_REQUEST_INTERVAL_MS',
  { providedIn: 'root', factory: () => 2100 },
);

@Injectable({ providedIn: 'root' })
export class TheSportsDbAdapter implements DataSourceAdapter {
  readonly sourceId = 'thesportsdb';
  private http = inject(HttpClient);
  private minRequestIntervalMs = inject(THESPORTSDB_MIN_REQUEST_INTERVAL_MS);
  private lastRequestAt = 0;

  async fetchTeamsForLeague(externalLeagueId: string, season: string): Promise<ImportedTeam[]> {
    const teamNames = await this.discoverTeamNames(externalLeagueId, season);
    const teams: ImportedTeam[] = [];
    // Sequencial, não Promise.all: disparar todas as buscas de time em
    // paralelo ignoraria o espaçamento entre chamadas e estouraria o limite
    // de qualquer forma.
    for (const name of teamNames) {
      const team = await this.fetchTeamByName(name, externalLeagueId);
      if (team) teams.push(team);
    }
    return teams;
  }

  async fetchLeagueDetails(externalLeagueId: string): Promise<LeagueDetails> {
    const response = await this.throttledGet<TheSportsDbLeagueResponse>('lookupleague.php', { id: externalLeagueId });
    const league = response.leagues?.[0];
    return { badgeUrl: league?.strBadge ?? undefined };
  }

  private async discoverTeamNames(externalLeagueId: string, season: string): Promise<string[]> {
    const names = new Set<string>();
    let roundsWithoutNewTeam = 0;

    for (let round = 1; round <= MAX_ROUNDS_TO_SCAN && roundsWithoutNewTeam < ROUNDS_WITHOUT_NEW_TEAM_TO_STOP; round++) {
      const response = await this.throttledGet<TheSportsDbEventsResponse>('eventsround.php', {
        id: externalLeagueId,
        r: String(round),
        s: season,
      });

      const sizeBefore = names.size;
      for (const event of response.events ?? []) {
        if (event.strHomeTeam) names.add(event.strHomeTeam);
        if (event.strAwayTeam) names.add(event.strAwayTeam);
      }

      roundsWithoutNewTeam = names.size === sizeBefore ? roundsWithoutNewTeam + 1 : 0;
    }

    return Array.from(names);
  }

  private async fetchTeamByName(name: string, externalLeagueId: string): Promise<ImportedTeam | null> {
    const response = await this.throttledGet<TheSportsDbTeamsResponse>('searchteams.php', { t: name });
    const candidates = response.teams ?? [];
    // Nomes de time podem colidir entre países (ex.: "América" existe no
    // Brasil e no México), então prioriza o resultado cujo idLeague bate com
    // a liga que estamos importando; sem isso, usa o primeiro resultado.
    const match = candidates.find(team => team.idLeague === externalLeagueId) ?? candidates[0];
    return match ? mapTeam(match) : null;
  }

  private async throttledGet<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const wait = this.lastRequestAt + this.minRequestIntervalMs - Date.now();
    if (wait > 0) {
      await new Promise(resolve => setTimeout(resolve, wait));
    }
    this.lastRequestAt = Date.now();

    const url = `${BASE_URL}/${environment.theSportsDbApiKey}/${endpoint}`;
    return firstValueFrom(this.http.get<T>(url, { params }));
  }
}

function mapTeam(team: TheSportsDbTeam): ImportedTeam {
  return {
    externalId: team.idTeam,
    name: team.strTeam,
    shortName: team.strTeamShort ?? undefined,
    alternateNames: team.strTeamAlternate
      ? team.strTeamAlternate.split(',').map(name => name.trim()).filter(Boolean)
      : [],
    country: team.strCountry ?? '',
    badgeUrl: team.strBadge ?? '',
    founded: team.intFormedYear ? Number(team.intFormedYear) : undefined,
    stadium: team.strStadium ?? undefined,
    website: team.strWebsite ?? undefined,
  };
}
