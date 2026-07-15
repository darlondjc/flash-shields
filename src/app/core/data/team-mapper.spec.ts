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

  it('translates national team names to Portuguese in national-team leagues, keeping the original as alternate', () => {
    const imported: ImportedTeam = {
      externalId: '133907',
      name: 'Germany',
      alternateNames: ['Deutschland'],
      country: 'Germany',
      badgeUrl: '',
    };

    const team = mapImportedTeamToTeam(imported, 'ts-4429');

    expect(team.name).toBe('Alemanha');
    expect(team.alternateNames).toContain('Germany');
    expect(team.alternateNames).toContain('Deutschland');
  });

  it('does not translate club names outside national-team leagues', () => {
    const imported: ImportedTeam = {
      externalId: '1',
      name: 'Brazil',
      alternateNames: [],
      country: 'Brazil',
      badgeUrl: '',
    };

    const team = mapImportedTeamToTeam(imported, 'ts-4328');

    expect(team.name).toBe('Brazil');
  });
});
