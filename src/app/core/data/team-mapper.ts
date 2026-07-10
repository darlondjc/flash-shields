import { ImportedTeam } from './data-source.adapter';
import { Team } from '../models/team.model';

export function mapImportedTeamToTeam(imported: ImportedTeam, leagueId: string): Team {
  const scopedLeagueId = leagueId.replace(/^ts-/, '');
  return {
    id: `ts-${scopedLeagueId}-${imported.externalId}`,
    externalIds: { thesportsdb: imported.externalId },
    name: imported.name,
    shortName: imported.shortName,
    alternateNames: imported.alternateNames,
    country: imported.country,
    leagueIds: [leagueId],
    badgeUrl: imported.badgeUrl,
    founded: imported.founded,
    stadium: imported.stadium,
    website: imported.website,
  };
}
