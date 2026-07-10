export interface ImportedTeam {
  externalId: string;
  name: string;
  shortName?: string;
  alternateNames: string[];
  country: string;
  badgeUrl: string;
  founded?: number;
  stadium?: string;
  website?: string;
}

export interface LeagueDetails {
  badgeUrl?: string;
}

export interface DataSourceAdapter {
  readonly sourceId: string;
  fetchTeamsForLeague(externalLeagueId: string, season: string): Promise<ImportedTeam[]>;
  fetchLeagueDetails(externalLeagueId: string): Promise<LeagueDetails>;
}
