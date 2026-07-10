import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DataSourceAdapter, ImportedTeam, LeagueDetails } from './data-source.adapter';

interface LeagueDto {
  externalId: string;
  badgeUrl?: string;
}

// Lê os dados já raspados e cacheados pelo backend (api/leagues, api/teams,
// api/badges — ver api/_lib/sync.ts), em vez de raspar a TheSportsDB no
// dispositivo do usuário. São paths relativos, então funcionam contra a
// própria origem do app tanto em produção (Vercel) quanto localmente rodando
// `vercel dev` — `ng serve` sozinho não serve /api, ver README.
@Injectable({ providedIn: 'root' })
export class RemoteApiAdapter implements DataSourceAdapter {
  readonly sourceId = 'flash-shields-api';
  private http = inject(HttpClient);

  async fetchLeagueDetails(externalLeagueId: string): Promise<LeagueDetails> {
    const league = await firstValueFrom(
      this.http.get<LeagueDto>('/api/leagues', { params: { id: externalLeagueId } }),
    );
    return { badgeUrl: league.badgeUrl };
  }

  // O parâmetro season é ignorado: o backend já descobriu o elenco usando a
  // temporada vigente no momento do sync (ver currentSeason em
  // api/_lib/sync.ts), então não há nada pro cliente escolher aqui — mantido
  // só para satisfazer a interface DataSourceAdapter.
  fetchTeamsForLeague(externalLeagueId: string, _season: string): Promise<ImportedTeam[]> {
    return firstValueFrom(
      this.http.get<ImportedTeam[]>('/api/teams', { params: { leagueId: externalLeagueId } }),
    );
  }
}
