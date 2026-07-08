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
    const badgeUrl = await this.adapter.fetchLeagueBadge(config.externalId);
    const league: League = {
      id: `ts-${config.externalId}`,
      externalIds: { thesportsdb: config.externalId },
      name: config.name,
      country: config.country,
      regionId: config.regionId,
      sport: 'soccer',
      badgeUrl,
    };
    await this.db.leagues.put(league);

    const importedTeams = await this.adapter.fetchTeamsForLeague(config.externalId);
    this.progress.set({ done: 0, total: importedTeams.length });

    for (const [index, imported] of importedTeams.entries()) {
      await this.db.upsertTeam(mapImportedTeamToTeam(imported, league.id));
      this.progress.set({ done: index + 1, total: importedTeams.length });
    }

    this.progress.set(null);
    return league;
  }
}
