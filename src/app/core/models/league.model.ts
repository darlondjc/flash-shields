export interface League {
  id: string;
  externalIds: Record<string, string>;
  name: string;
  country: string;
  regionId: string;
  sport: 'soccer';
  badgeUrl?: string;
}
