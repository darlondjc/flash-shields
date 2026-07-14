import { Injectable, inject, signal } from '@angular/core';
import { DbService } from '../persistence/db.service';
import { RemoteApiAdapter } from './remote-api.adapter';
import { mapImportedTeamToTeam } from './team-mapper';
import { LeagueImportConfig } from './league-import.config';
import { currentSeason } from './season';
import { League } from '../models/league.model';
import { DeckService } from '../decks/deck.service';
import { NotificationService } from '../notifications/notification.service';

const LAST_CHECKED_AT_KEY = 'flash-shields:data-last-checked-at';
const LAST_UPDATED_AT_KEY = 'flash-shields:data-last-updated-at';

@Injectable({ providedIn: 'root' })
export class ImportService {
  private adapter = inject(RemoteApiAdapter);
  private db = inject(DbService);
  private deckService = inject(DeckService);
  private notifications = inject(NotificationService);

  readonly isImporting = signal(false);
  readonly progress = signal<{ done: number; total: number } | null>(null);

  // Exibidos no card de dados em Configurações. "Verificação" é toda checagem
  // de dados faltantes (boot do app ou atualização manual); "atualização" é
  // quando uma importação de fato terminou com sucesso. Persistidos em
  // localStorage, então "Resetar dados" (localStorage.clear) zera os dois.
  readonly lastCheckedAt = signal<string | null>(localStorage.getItem(LAST_CHECKED_AT_KEY));
  readonly lastUpdatedAt = signal<string | null>(localStorage.getItem(LAST_UPDATED_AT_KEY));

  markDataChecked(): void {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_CHECKED_AT_KEY, now);
    this.lastCheckedAt.set(now);
  }

  private markDataUpdated(): void {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_UPDATED_AT_KEY, now);
    this.lastUpdatedAt.set(now);
  }

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
      this.markDataChecked();
      this.markDataUpdated();
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

    const importedTeams = await this.adapter.fetchTeamsForLeague(
      config.externalId,
      config.season ?? currentSeason(config.regionId),
    );

    const importedIds = new Set<string>();
    for (const imported of importedTeams) {
      const team = mapImportedTeamToTeam(imported, league.id);
      importedIds.add(team.id);
      const existingTeam = await this.db.teams.get(team.id);
      if (existingTeam) {
        const mergedLeagueIds = Array.from(new Set([...existingTeam.leagueIds, ...team.leagueIds]));
        await this.db.teams.put({ ...existingTeam, ...team, leagueIds: mergedLeagueIds });
      } else {
        await this.db.teams.put(team);
      }
    }

    // Remove times locais que saíram do elenco da liga (mesmo critério de
    // pertencimento do DeckService): sem isso, um time importado errado e
    // depois corrigido no backend continuaria no deck e na Pesquisa pra
    // sempre. Só quando o import trouxe algo — uma resposta vazia não pode
    // apagar a liga inteira local.
    if (importedTeams.length > 0) {
      const scopedPrefix = `ts-${config.externalId}-`;
      const allTeams = await this.db.teams.toArray();
      const staleIds = allTeams
        .filter(team => (team.leagueIds.includes(league.id) || team.id.startsWith(scopedPrefix)) && !importedIds.has(team.id))
        .map(team => team.id);
      if (staleIds.length > 0) {
        await this.db.teams.bulkDelete(staleIds);
      }
    }

    return league;
  }
}
