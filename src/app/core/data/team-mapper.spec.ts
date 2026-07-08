import { mapImportedTeamToTeam } from './team-mapper';
import { ImportedTeam } from './data-source.adapter';

describe('mapImportedTeamToTeam', () => {
  it('builds a stable, prefixed internal id from the external id', () => {
    const imported: ImportedTeam = {
      externalId: '133604',
      name: 'Arsenal',
      alternateNames: ['Arsenal FC'],
      country: 'England',
      badgeUrl: 'https://example.com/arsenal.png',
    };

    const team = mapImportedTeamToTeam(imported, 'ts-4328');

    expect(team.id).toBe('ts-4328-133604');
    expect(team.externalIds).toEqual({ thesportsdb: '133604' });
    expect(team.leagueIds).toEqual(['ts-4328']);
    expect(team.name).toBe('Arsenal');
    expect(team.badgeUrl).toBe('https://example.com/arsenal.png');
  });
});
