import { Injectable, inject } from '@angular/core';
import { ImportService } from './import.service';
import { DeckService } from '../decks/deck.service';
import { LeagueService } from '../leagues/league.service';
import { LEAGUES_TO_IMPORT, LeagueImportConfig } from './league-import.config';
import { warmImageCache } from '../persistence/badge-warmer';
import { DbService } from '../persistence/db.service';

@Injectable({ providedIn: 'root' })
export class AppInitService {
  private importService = inject(ImportService);
  private deckService = inject(DeckService);
  private leagueService = inject(LeagueService);
  private db = inject(DbService);

  // comingSoon leagues are placeholders with no importable data, so they
  // never take part in the boot-time import.
  private readonly leaguesToImport = LEAGUES_TO_IMPORT.filter(config => !config.comingSoon);

  // Runs without blocking the UI: ImportService.isImporting/progress drive a
  // non-blocking indicator in the top bar, and screens react to those signals
  // to refresh as each league lands, so the user can navigate immediately
  // instead of waiting behind a splash screen.
  async run(): Promise<void> {
    const missing = await this.findMissingLeagues();
    this.importService.markDataChecked();
    if (missing.length === 0) return;

    await this.importService.importLeagues(missing);
    await this.warmBadges();
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
  // just lets the browser's own HTTP cache absorb the response instead. Runs
  // silently in the background — it's a cache-priming nicety, not something
  // worth surfacing progress for.
  private async warmBadges(): Promise<void> {
    const [allTeams, allLeagues] = await Promise.all([this.db.teams.toArray(), this.leagueService.listLeagues()]);
    const leagueBadgeUrls = allLeagues.map(league => league.badgeUrl).filter((url): url is string => !!url);
    const teamBadgeUrls = allTeams.flatMap(team => [team.badgeUrl, team.badgeQuestionUrl]).filter((url): url is string => !!url);
    const urls = [...leagueBadgeUrls, ...teamBadgeUrls];

    await warmImageCache(urls);
  }
}
