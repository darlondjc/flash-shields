import { Injectable, inject, signal } from '@angular/core';
import { DbService } from '../persistence/db.service';
import { TheSportsDbAdapter } from './thesportsdb.adapter';
import { mapImportedTeamToTeam } from './team-mapper';
import { LeagueImportConfig } from './league-import.config';
import { currentSeason } from './season';
import { League } from '../models/league.model';
import { DeckService } from '../decks/deck.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable({ providedIn: 'root' })
export class ImportService {
  private adapter = inject(TheSportsDbAdapter);
  private db = inject(DbService);
  private deckService = inject(DeckService);
  private notifications = inject(NotificationService);

  readonly isImporting = signal(false);
  readonly progress = signal<{ done: number; total: number } | null>(null);

  // Imports a batch of leagues in the background (also creating/refreshing
  // their decks), tracking progress via isImporting/progress so any screen
  // can show a non-blocking indicator and react as each league lands. Used
  // both for the first-run import and for the "atualizar dados importados"
  // action in Configurações, so both paths behave the same way.
  async importLeagues(configs: LeagueImportConfig[]): Promise<void> {
    if (configs.length === 0) return;

    this.isImporting.set(true);
    this.progress.set({ done: 0, total: configs.length });
    try {
      for (const [index, config] of configs.entries()) {
        const league = await this.importLeague(config);
        await this.deckService.createLeagueDeck(league);
        this.progress.set({ done: index + 1, total: configs.length });
      }
      this.notifications.show(
        configs.length === 1 ? `${configs[0].name} importada.` : `Importação concluída: ${configs.length} ligas atualizadas.`,
      );
    } catch {
      this.notifications.show('Falha ao importar dados. Tente novamente.');
    } finally {
      this.isImporting.set(false);
      this.progress.set(null);
    }
  }

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

    const importedTeams = await this.adapter.fetchTeamsForLeague(config.externalId, currentSeason(config.regionId));

    for (const imported of importedTeams) {
      const team = mapImportedTeamToTeam(imported, league.id);
      const existingTeam = await this.db.teams.get(team.id);
      if (existingTeam) {
        const mergedLeagueIds = Array.from(new Set([...existingTeam.leagueIds, ...team.leagueIds]));
        await this.db.teams.put({ ...existingTeam, ...team, leagueIds: mergedLeagueIds });
      } else {
        await this.db.teams.put(team);
      }
    }

    return league;
  }
}
