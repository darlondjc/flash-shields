export type DeckScope =
  | { kind: 'league'; leagueId: string }
  | { kind: 'country'; country: string }
  | { kind: 'region'; regionId: string }
  | { kind: 'custom' };

export interface Deck {
  id: string;
  name: string;
  scope: DeckScope;
  teamIds: string[];
  createdAt: string;
}
