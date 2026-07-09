import { Injectable, inject, signal } from '@angular/core';
import { DbService } from '../persistence/db.service';
import { TheSportsDbAdapter } from './thesportsdb.adapter';
import { mapImportedTeamToTeam } from './team-mapper';
import { LeagueImportConfig } from './league-import.config';
import { League } from '../models/league.model';

@Injectable({ providedIn: 'root' })
export class ImportService {
  private adapter = inject(TheSportsDbAdapter);
  private db = inject(DbService);

  readonly progress = signal<{ done: number; total: number } | null>(null);

  async importLeague(config: LeagueImportConfig): Promise<League> {
    const details = await this.adapter.fetchLeagueDetails(config.externalId);
    const league: League = {
      id: `ts-${config.externalId}`,
      externalIds: { thesportsdb: config.externalId },
      name: config.name,
      country: config.country,
      regionId: config.regionId,
      sport: 'soccer',
      badgeUrl: details.badgeUrl,
    };
    await this.db.leagues.put(league);

    // O time é buscado pelo nome canônico da liga na TheSportsDB (strLeague),
    // não pelo externalId: com a chave de teste gratuita, buscar por id sempre
    // devolve a mesma amostra fixa de times, ignorando a liga selecionada.
    const importedTeams = await this.adapter.fetchTeamsForLeague(details.name ?? config.name);
    this.progress.set({ done: 0, total: importedTeams.length });

    for (const [index, imported] of importedTeams.entries()) {
      const team = mapImportedTeamToTeam(imported, league.id);
      const existingTeam = await this.db.teams.get(team.id);
      if (existingTeam) {
        const mergedLeagueIds = Array.from(new Set([...existingTeam.leagueIds, ...team.leagueIds]));
        await this.db.teams.put({ ...existingTeam, ...team, leagueIds: mergedLeagueIds });
      } else {
        await this.db.teams.put(team);
      }
      this.progress.set({ done: index + 1, total: importedTeams.length });
    }

    this.progress.set(null);
    return league;
  }
}
