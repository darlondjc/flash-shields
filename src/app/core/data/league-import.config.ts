export interface LeagueImportConfig {
  externalId: string;
  name: string;
  country: string;
  regionId: string;
}

export const MVP_LEAGUES_TO_IMPORT: LeagueImportConfig[] = [
  { externalId: '4328', name: 'Premier League', country: 'England', regionId: 'europe' },
];
