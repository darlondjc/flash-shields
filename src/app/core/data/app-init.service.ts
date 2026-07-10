import { Injectable, inject, signal } from '@angular/core';
import { ImportService } from './import.service';
import { DeckService } from '../decks/deck.service';
import { LeagueService } from '../leagues/league.service';
import { LEAGUES_TO_IMPORT, LeagueImportConfig } from './league-import.config';
import { warmImageCache } from '../persistence/badge-warmer';
import { DbService } from '../persistence/db.service';
import { League } from '../models/league.model';

export type AppInitStage =
  | { kind: 'importing'; done: number; total: number }
  | { kind: 'warming-badges'; done: number; total: number }
  | { kind: 'ready' };

@Injectable({ providedIn: 'root' })
export class AppInitService {
  private importService = inject(ImportService);
  private deckService = inject(DeckService);
  private leagueService = inject(LeagueService);
  private db = inject(DbService);

  readonly stage = signal<AppInitStage>({ kind: 'importing', done: 0, total: 0 });

  // comingSoon leagues (Copa do Mundo etc.) are placeholders with no importable
  // data, so they never take part in the boot-time import.
  private readonly leaguesToImport = LEAGUES_TO_IMPORT.filter(config => !config.comingSoon);

  async run(): Promise<void> {
    const missing = await this.findMissingLeagues();

    if (missing.length > 0) {
      this.stage.set({ kind: 'importing', done: 0, total: missing.length });
      const importedLeagues: League[] = [];
      for (const [index, config] of missing.entries()) {
        const league = await this.importService.importLeague(config);
        await this.deckService.createLeagueDeck(league);
        importedLeagues.push(league);
        this.stage.set({ kind: 'importing', done: index + 1, total: missing.length });
      }

      await this.warmBadges(importedLeagues);
    }

    this.stage.set({ kind: 'ready' });
  }

  private async findMissingLeagues(): Promise<LeagueImportConfig[]> {
    const results = await Promise.all(
      this.leaguesToImport.map(async config => ((await this.isLeagueReady(config)) ? null : config)),
    );
    return results.filter((config): config is LeagueImportConfig => !!config);
  }

  private async isLeagueReady(config: LeagueImportConfig): Promise<boolean> {
    const leagueId = `ts-${config.externalId}`;
    const league = await this.leagueService.getLeague(leagueId);
    if (!league) return false;
    const deck = await this.deckService.getDeck(`deck-league-${leagueId}`);
    return !!deck && deck.teamIds.length > 0;
  }

  // Not routed through BadgeCacheService: that service tries to fetch each
  // badge as a blob for IndexedDB storage, which fails for effectively every
  // TheSportsDB badge because their CDN sends no CORS header. warmImageCache
  // just lets the browser's own HTTP cache absorb the response instead.
  private async warmBadges(importedLeagues: League[]): Promise<void> {
    const allTeams = await this.db.teams.toArray();
    const leagueBadgeUrls = importedLeagues.map(league => league.badgeUrl).filter((url): url is string => !!url);
    const teamBadgeUrls = allTeams.map(team => team.badgeUrl).filter(Boolean);
    const urls = [...leagueBadgeUrls, ...teamBadgeUrls];

    this.stage.set({ kind: 'warming-badges', done: 0, total: urls.length });
    await warmImageCache(urls, {
      onProgress: (done, total) => this.stage.set({ kind: 'warming-badges', done, total }),
    });
  }
}
