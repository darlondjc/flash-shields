export interface ImportedTeam {
  externalId: string;
  name: string;
  shortName?: string;
  alternateNames: string[];
  country: string;
  badgeUrl: string;
  founded?: number;
}

export interface LeagueDetails {
  name?: string;
  badgeUrl?: string;
}

export interface DataSourceAdapter {
  readonly sourceId: string;
  fetchTeamsForLeague(leagueName: string): Promise<ImportedTeam[]>;
  fetchLeagueDetails(externalLeagueId: string): Promise<LeagueDetails>;
}
