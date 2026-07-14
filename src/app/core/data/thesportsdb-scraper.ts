// Lógica de scraping da TheSportsDB compartilhada entre o client Angular
// (TheSportsDbAdapter) e a function de sync na Vercel (api/_lib/thesportsdb-client.ts).
// Sem dependência de Angular ou de um transporte HTTP específico — quem chama
// injeta a função `get`, que sabe fazer um GET autenticado (com sua própria
// estratégia de throttle, se precisar) e devolver o JSON já parseado.
import { ImportedTeam, LeagueDetails } from './data-source.adapter';

export interface TheSportsDbTeam {
  idTeam: string;
  strTeam: string;
  strTeamShort: string | null;
  // O campo de nomes alternativos da API se chama strTeamAlternate — não
  // existe strAlternate (confirmado contra a API real; um código anterior
  // lia o campo errado e "nomes alternativos" nunca vinha preenchido).
  strTeamAlternate: string | null;
  strCountry: string | null;
  strBadge: string | null;
  intFormedYear: string | null;
  idLeague: string | null;
  strSport?: string | null;
  strStadium: string | null;
  strWebsite: string | null;
}

export interface TheSportsDbTeamsResponse {
  teams: TheSportsDbTeam[] | null;
}

export interface TheSportsDbLeague {
  idLeague: string;
  strLeague: string | null;
  strBadge: string | null;
}

export interface TheSportsDbLeagueResponse {
  leagues: TheSportsDbLeague[] | null;
}

export interface TheSportsDbEvent {
  strHomeTeam: string | null;
  strAwayTeam: string | null;
}

export interface TheSportsDbEventsResponse {
  events: TheSportsDbEvent[] | null;
}

export const THESPORTSDB_BASE_URL = 'https://www.thesportsdb.com/api/v1/json';

// search_all_teams.php?l=<nome da liga> corta o resultado em 10 times mesmo
// quando a liga tem mais elenco (limite da chave de teste gratuita, testado
// contra a API real com times de verdade — não é algo que dá pra contornar
// trocando de chave). eventsround.php não tem esse corte por liga: cada
// rodada devolve seus próprios jogos, e times diferentes aparecem em rodadas
// diferentes, então iterar rodadas descobre o elenco completo. Times
// individuais são então buscados via searchteams.php?t=<nome>, que também não
// tem esse corte por ser uma busca por time, não por liga.
export const MAX_ROUNDS_TO_SCAN = 40;
export const ROUNDS_WITHOUT_NEW_TEAM_TO_STOP = 3;

// Função de transporte que cada lado injeta: monta a URL final (base +
// chave + endpoint), faz o GET com os params dados e devolve o JSON
// parseado. Quem implementa decide throttle/auth/erro.
export type ThesportsdbGet = <T>(endpoint: string, params: Record<string, string>) => Promise<T>;

export function mapTeam(team: TheSportsDbTeam): ImportedTeam {
  return {
    externalId: team.idTeam,
    name: team.strTeam,
    shortName: team.strTeamShort ?? undefined,
    alternateNames: team.strTeamAlternate
      ? team.strTeamAlternate.split(',').map(name => name.trim()).filter(Boolean)
      : [],
    country: team.strCountry ?? '',
    badgeUrl: team.strBadge ?? '',
    founded: team.intFormedYear ? Number(team.intFormedYear) : undefined,
    stadium: team.strStadium ?? undefined,
    website: team.strWebsite ?? undefined,
  };
}

export async function discoverTeamNames(get: ThesportsdbGet, externalLeagueId: string, season: string): Promise<string[]> {
  const names = new Set<string>();
  let roundsWithoutNewTeam = 0;

  for (let round = 1; round <= MAX_ROUNDS_TO_SCAN && roundsWithoutNewTeam < ROUNDS_WITHOUT_NEW_TEAM_TO_STOP; round++) {
    const response = await get<TheSportsDbEventsResponse>('eventsround.php', {
      id: externalLeagueId,
      r: String(round),
      s: season,
    });

    const sizeBefore = names.size;
    for (const event of response.events ?? []) {
      if (event.strHomeTeam) names.add(event.strHomeTeam);
      if (event.strAwayTeam) names.add(event.strAwayTeam);
    }

    roundsWithoutNewTeam = names.size === sizeBefore ? roundsWithoutNewTeam + 1 : 0;
  }

  return Array.from(names);
}

export async function fetchTeamByName(get: ThesportsdbGet, name: string, externalLeagueId: string): Promise<ImportedTeam | null> {
  const response = await get<TheSportsDbTeamsResponse>('searchteams.php', { t: name });
  // A busca é por nome em toda a base, então colide com outros esportes:
  // 'Jordan' retorna a equipe extinta de F1, 'Georgia' um time universitário
  // de futebol americano. Sem strSport na resposta (não deveria acontecer),
  // dá o benefício da dúvida em vez de descartar.
  const candidates = (response.teams ?? []).filter(team => team.strSport == null || team.strSport === 'Soccer');
  // Nomes de time podem colidir entre países (ex.: "América" existe no
  // Brasil e no México), então prioriza o resultado cujo idLeague bate com
  // a liga que estamos importando; sem isso, usa o primeiro resultado.
  const match = candidates.find(team => team.idLeague === externalLeagueId) ?? candidates[0];
  return match ? mapTeam(match) : null;
}

// knownTeamNames pula a descoberta por rodadas: torneios de seleções têm
// elenco fixo por edição (ver teamNames em league-import.config.ts), e a
// varredura de eventsround — pensada pra ligas de clubes com dezenas de
// rodadas — não cobre o elenco inteiro de um torneio curto na chave gratuita.
export async function fetchTeamsForLeague(
  get: ThesportsdbGet,
  externalLeagueId: string,
  season: string,
  knownTeamNames?: string[],
): Promise<ImportedTeam[]> {
  const teamNames = knownTeamNames ?? (await discoverTeamNames(get, externalLeagueId, season));
  const teams: ImportedTeam[] = [];
  // Sequencial, não Promise.all: disparar todas as buscas de time em
  // paralelo ignoraria o espaçamento entre chamadas e estouraria o limite
  // de qualquer forma.
  for (const name of teamNames) {
    const team = await fetchTeamByName(get, name, externalLeagueId);
    if (team) teams.push(team);
  }
  return teams;
}

export async function fetchLeagueDetails(get: ThesportsdbGet, externalLeagueId: string): Promise<LeagueDetails> {
  const response = await get<TheSportsDbLeagueResponse>('lookupleague.php', { id: externalLeagueId });
  const league = response.leagues?.[0];
  return { badgeUrl: league?.strBadge ?? undefined };
}
