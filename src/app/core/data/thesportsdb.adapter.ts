import { Injectable, InjectionToken, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DataSourceAdapter, ImportedTeam, LeagueDetails } from './data-source.adapter';
import {
  THESPORTSDB_BASE_URL,
  ThesportsdbGet,
  fetchLeagueDetails,
  fetchTeamsForLeague,
} from './thesportsdb-scraper';

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

  private get: ThesportsdbGet = async <T>(endpoint: string, params: Record<string, string>) => {
    const wait = this.lastRequestAt + this.minRequestIntervalMs - Date.now();
    if (wait > 0) {
      await new Promise(resolve => setTimeout(resolve, wait));
    }
    this.lastRequestAt = Date.now();

    const url = `${THESPORTSDB_BASE_URL}/${environment.theSportsDbApiKey}/${endpoint}`;
    return firstValueFrom(this.http.get<T>(url, { params }));
  };

  fetchTeamsForLeague(externalLeagueId: string, season: string): Promise<ImportedTeam[]> {
    return fetchTeamsForLeague(this.get, externalLeagueId, season);
  }

  fetchLeagueDetails(externalLeagueId: string): Promise<LeagueDetails> {
    return fetchLeagueDetails(this.get, externalLeagueId);
  }
}
