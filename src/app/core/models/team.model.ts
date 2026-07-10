export interface Team {
  id: string;
  externalIds: Record<string, string>;
  name: string;
  shortName?: string;
  alternateNames: string[];
  country: string;
  leagueIds: string[];
  badgeUrl: string;
  badgeLocalKey?: string;
  founded?: number;
  colors?: string;
  stadium?: string;
  website?: string;
}
