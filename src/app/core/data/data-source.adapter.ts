export interface ImportedTeam {
  externalId: string;
  name: string;
  shortName?: string;
  alternateNames: string[];
  country: string;
  badgeUrl: string;
  founded?: number;
}

export interface DataSourceAdapter {
  readonly sourceId: string;
  fetchTeamsForLeague(externalLeagueId: string): Promise<ImportedTeam[]>;
}
