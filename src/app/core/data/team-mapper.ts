import { ImportedTeam } from './data-source.adapter';
import { Team } from '../models/team.model';
import { LEAGUES_TO_IMPORT } from './league-import.config';
import { NATIONAL_TEAM_NAMES_PT } from './national-team-names';

// Ligas de seleções (Copa do Mundo, Copa América, Eurocopa): só nelas o nome
// do time é traduzido — clubes de outras ligas mantêm o nome original mesmo
// quando coincide com um país (não há caso hoje, mas custa nada prevenir).
const NATIONAL_TEAM_LEAGUE_IDS = new Set(
  LEAGUES_TO_IMPORT.filter(config => config.regionId === 'world').map(config => `ts-${config.externalId}`),
);

export function mapImportedTeamToTeam(imported: ImportedTeam, leagueId: string): Team {
  const scopedLeagueId = leagueId.replace(/^ts-/, '');
  const ptName = NATIONAL_TEAM_LEAGUE_IDS.has(leagueId) ? NATIONAL_TEAM_NAMES_PT[imported.name] : undefined;
  // O nome original (inglês) vira nome alternativo pra continuar acionável
  // na busca da Pesquisa.
  const alternateNames = ptName
    ? Array.from(new Set([imported.name, ...imported.alternateNames]))
    : imported.alternateNames;
  return {
    id: `ts-${scopedLeagueId}-${imported.externalId}`,
    externalIds: { thesportsdb: imported.externalId },
    name: ptName ?? imported.name,
    shortName: imported.shortName,
    alternateNames,
    country: imported.country,
    leagueIds: [leagueId],
    badgeUrl: imported.badgeUrl,
    badgeQuestionUrl: imported.badgeQuestionUrl,
    badgeGameUrl: imported.badgeGameUrl,
    founded: imported.founded,
    stadium: imported.stadium,
    website: imported.website,
  };
}
