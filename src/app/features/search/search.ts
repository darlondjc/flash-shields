import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import ArrowLeft02Icon from '@hugeicons/core-free-icons/ArrowLeft02Icon';
import Exchange01Icon from '@hugeicons/core-free-icons/Exchange01Icon';
import { DeckService } from '../../core/decks/deck.service';
import { ImportService } from '../../core/data/import.service';
import { LeagueService } from '../../core/leagues/league.service';
import { TeamService } from '../../core/leagues/team.service';
import { countryOptions, leaguesForCountry, countryFlag, CountryOption } from '../../core/leagues/league-catalog';
import { LEAGUES_TO_IMPORT, LeagueImportConfig } from '../../core/data/league-import.config';
import { Deck } from '../../core/models/deck.model';
import { League } from '../../core/models/league.model';
import { Team } from '../../core/models/team.model';
import { LeagueBadge } from '../../shared/ui/league-badge';
import { TeamBadge } from '../../shared/ui/team-badge';

// comingSoon leagues have no real teams to browse (some don't even have a
// numeric TheSportsDB id), so Pesquisa excludes them entirely.
const SEARCHABLE_LEAGUES = LEAGUES_TO_IMPORT.filter(config => !config.comingSoon);

@Component({
  selector: 'app-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HugeiconsIconComponent, LeagueBadge, TeamBadge],
  templateUrl: './search.html',
  styleUrl: './search.scss',
})
export class Search {
  private deckService = inject(DeckService);
  private importService = inject(ImportService);
  private leagueService = inject(LeagueService);
  private teamService = inject(TeamService);
  private route = inject(ActivatedRoute);

  readonly Home01Icon = Home01Icon;
  readonly Search01Icon = Search01Icon;
  readonly ArrowLeft02Icon = ArrowLeft02Icon;
  readonly Exchange01Icon = Exchange01Icon;
  
  readonly query = signal('');
  readonly matchedLeagues = signal<LeagueImportConfig[] | null>(null);
  readonly selectedCountry = signal<string | null>(null);
  readonly selectedLeagueConfig = signal<LeagueImportConfig | null>(null);
  readonly leagueTeams = signal<Team[]>([]);
  readonly selectedTeam = signal<Team | null>(null);
  readonly leagues = signal<Map<string, League>>(new Map());
  readonly decks = signal<Deck[]>([]);

  constructor() {
    this.refreshCatalog();
    void this.restoreFromQueryParams();

    // Background imports (first-run boot import, or "Atualizar dados
    // importados" from Configurações) tick ImportService.progress as each
    // league lands, so this keeps the catalog — and the currently open
    // league's team list, if any — live without a manual refresh.
    effect(() => {
      this.importService.progress();
      void this.refreshCatalogAndCurrentLeague();
    });
  }

  private async refreshCatalogAndCurrentLeague() {
    await this.refreshCatalog();
    const config = this.selectedLeagueConfig();
    if (config) await this.openLeague(config);
  }

  private async refreshCatalog() {
    this.decks.set(await this.deckService.listDecks());
    const entries = await Promise.all(
      SEARCHABLE_LEAGUES.map(async config => {
        const leagueId = `ts-${config.externalId}`;
        return [leagueId, await this.leagueService.getLeague(leagueId)] as const;
      }),
    );
    this.leagues.set(new Map(entries.filter((entry): entry is [string, League] => !!entry[1])));
  }

  private async restoreFromQueryParams() {
    const leagueExternalId = this.route.snapshot.queryParamMap.get('league');
    const teamId = this.route.snapshot.queryParamMap.get('team');
    if (!leagueExternalId) return;

    const config = SEARCHABLE_LEAGUES.find(c => c.externalId === leagueExternalId);
    if (!config) return;

    this.selectedCountry.set(config.country);
    await this.openLeague(config);

    if (teamId) {
      const team = this.leagueTeams().find(t => t.id === teamId);
      if (team) this.selectedTeam.set(team);
    }
  }

  countryOptions(): CountryOption[] {
    return countryOptions(SEARCHABLE_LEAGUES);
  }

  leaguesForCountry(country: string): LeagueImportConfig[] {
    return leaguesForCountry(SEARCHABLE_LEAGUES, country);
  }

  countryFlag(country: string): string {
    return countryFlag(country);
  }

  leagueFor(externalId: string): League | undefined {
    return this.leagues().get(`ts-${externalId}`);
  }

  async onQueryChange(value: string) {
    this.query.set(value);
    const trimmed = value.trim();
    if (!trimmed) {
      this.matchedLeagues.set(null);
      return;
    }

    const matches = await this.teamService.searchByName(trimmed);
    const matchedTeamIds = new Set(matches.map(team => team.id));
    const decks = this.decks();
    const matchedLeagues = SEARCHABLE_LEAGUES.filter(config => {
      const deck = decks.find(d => d.scope.kind === 'league' && d.scope.leagueId === `ts-${config.externalId}`);
      return !!deck && deck.teamIds.some(id => matchedTeamIds.has(id));
    });
    this.matchedLeagues.set(matchedLeagues);
  }

  selectCountry(country: string) {
    this.selectedCountry.set(country);
    this.selectedLeagueConfig.set(null);
    this.selectedTeam.set(null);
  }

  backToCountries() {
    this.selectedCountry.set(null);
    this.selectedLeagueConfig.set(null);
    this.selectedTeam.set(null);
  }

  backToLeagues() {
    this.selectedLeagueConfig.set(null);
    this.leagueTeams.set([]);
    this.selectedTeam.set(null);
  }

  backToTeams() {
    this.selectedTeam.set(null);
  }

  async openLeague(config: LeagueImportConfig) {
    this.selectedLeagueConfig.set(config);
    const deck = this.decks().find(d => d.scope.kind === 'league' && d.scope.leagueId === `ts-${config.externalId}`);
    const teamIds = deck?.teamIds ?? [];
    const teams = await Promise.all(teamIds.map(id => this.teamService.getTeam(id)));
    this.leagueTeams.set(teams.filter((team): team is Team => !!team));
  }

  selectTeam(team: Team) {
    this.selectedTeam.set(team);
  }

  teamAge(team: Team): number | null {
    if (!team.founded) return null;
    return new Date().getFullYear() - team.founded;
  }

  teamWebsiteHref(team: Team): string {
    const website = team.website ?? '';
    return /^https?:\/\//i.test(website) ? website : `https://${website}`;
  }

  leagueNamesFor(team: Team): string[] {
    return team.leagueIds
      .map(id => SEARCHABLE_LEAGUES.find(c => `ts-${c.externalId}` === id)?.name)
      .filter((name): name is string => !!name);
  }
}
