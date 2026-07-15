export interface LeagueImportConfig {
  externalId: string;
  name: string;
  country: string;
  regionId: string;
  comingSoon?: boolean;
  // Torneios de seleções não seguem o calendário de clubes (currentSeason):
  // cada edição é um ano fixo, então a temporada vem daqui.
  season?: string;
  // Elenco fixo da edição, com os nomes exatos do TheSportsDB (enumerados via
  // eventsday.php da edição). Quando presente, o sync pula a descoberta por
  // rodadas — que com a chave gratuita corta cada rodada em 5 jogos e deixaria
  // um torneio curto de grupos com o elenco incompleto — e busca cada seleção
  // direto via searchteams.php.
  teamNames?: string[];
}

// IDs de liga do TheSportsDB (visíveis na URL do site). Apenas ligas
// disponíveis no tier gratuito da API — ver docs/especificacao.md.
export const LEAGUES_TO_IMPORT: LeagueImportConfig[] = [
  { externalId: '4328', name: 'Premier League', country: 'Inglaterra', regionId: 'europe' },
  { externalId: '4335', name: 'La Liga', country: 'Espanha', regionId: 'europe' },
  { externalId: '4331', name: 'Bundesliga', country: 'Alemanha', regionId: 'europe' },
  { externalId: '4332', name: 'Serie A', country: 'Itália', regionId: 'europe' },
  { externalId: '4334', name: 'Ligue 1', country: 'França', regionId: 'europe' },
  { externalId: '4337', name: 'Eredivisie', country: 'Países Baixos', regionId: 'europe' },
  { externalId: '4344', name: 'Primeira Liga', country: 'Portugal', regionId: 'europe' },
  { externalId: '4329', name: 'Championship', country: 'Inglaterra', regionId: 'europe' },
  { externalId: '4351', name: 'Brasileirão Série A', country: 'Brasil', regionId: 'south-america' },
  // Série B/C/D usavam IDs errados (4358 é a liga norueguesa Eliteserine, 4360
  // e 4362 não existem no TheSportsDB), o que fazia o import trazer poucos ou
  // nenhum time correto. IDs corretos confirmados via lookupleague.php e
  // searchteams.php (times conhecidos de cada série retornam este idLeague).
  { externalId: '4404', name: 'Brasileirão Série B', country: 'Brasil', regionId: 'south-america' },
  { externalId: '4625', name: 'Brasileirão Série C', country: 'Brasil', regionId: 'south-america' },
  { externalId: '5079', name: 'Brasileirão Série D', country: 'Brasil', regionId: 'south-america' },
  {
    externalId: '4725',
    name: 'Copa do Brasil',
    country: 'Brasil',
    regionId: 'south-america',
    // A Copa do Brasil não é descobrível por rodadas (as fases usam rótulos
    // de intRound fora do scan sequencial), então o elenco é fixado por
    // edição: os clubes da terceira fase em diante de 2026, enumerados via
    // eventsday.php — o recorte com todos os grandes que a API expõe inteiro
    // na chave gratuita (a edição completa tem 91 clubes, a maioria de fases
    // preliminares).
    // 'Athletic Club' (sem o -MG): a busca pelo nome oficial com sufixo não
    // retorna nada; a busca curta acha o clube certo (o matcher confere que
    // ele disputa a 4725, então não colide com o Athletic Bilbao).
    teamNames: [
      'Athletic Club', 'Atlético Mineiro', 'Barra', 'Botafogo', 'Ceará',
      'Chapecoense', 'Corinthians', 'Cruzeiro', 'Flamengo', 'Fluminense',
      'Fortaleza', 'Goiás', 'Grêmio', 'Internacional', 'Mirassol',
      'Operário Ferroviário', 'Palmeiras', 'Paysandu', 'Remo', 'Santos',
      'Vasco da Gama', 'Vitória',
    ],
  },
  {
    externalId: '4346',
    name: 'MLS',
    country: 'Estados Unidos',
    regionId: 'north-america',
    // A descoberta por rodadas acha 27 dos 30 clubes na chave gratuita (o
    // corte de 5 jogos/rodada esconde alguns), então o elenco 2026 vai fixo.
    teamNames: [
      'Atlanta United', 'Austin FC', 'CF Montréal', 'Charlotte FC', 'Chicago Fire',
      'Colorado Rapids', 'Columbus Crew', 'DC United', 'FC Cincinnati', 'FC Dallas',
      'Houston Dynamo', 'Inter Miami', 'LA Galaxy', 'Los Angeles FC', 'Minnesota United',
      'Nashville SC', 'New England Revolution', 'New York City FC', 'New York Red Bulls',
      'Orlando City', 'Philadelphia Union', 'Portland Timbers', 'Real Salt Lake',
      'San Diego FC', 'San Jose Earthquakes', 'Seattle Sounders', 'Sporting Kansas City',
      'id:147062', // St. Louis City SC — a busca por qualquer grafia do nome retorna o Louisville City
      'Toronto FC', 'Vancouver Whitecaps',
    ],
  },
  // Copas continentais de clubes: o elenco muda por edição, então segue fixo
  // na edição corrente (fase de grupos, enumerada via eventsday.php) — a
  // descoberta por rodadas cobre só ~30 dos 32 na chave gratuita.
  {
    externalId: '4501',
    name: 'Copa Libertadores',
    country: 'Internacional',
    regionId: 'south-america',
    teamNames: [
      'Always Ready', 'Atlético Junior', 'Barcelona SC', 'Boca Juniors', 'Bolívar',
      'Cerro Porteño', 'Club Libertad', 'Coquimbo Unido', 'Corinthians', 'Cruzeiro',
      'Cusco', 'Deportes Tolima', 'Deportivo La Guaira', 'Estudiantes de La Plata',
      'Flamengo', 'Fluminense', 'Independiente Medellín', 'Independiente Rivadavia',
      'Independiente Santa Fe', 'Independiente del Valle', 'LDU Quito', 'Lanús',
      'Mirassol', 'Nacional Montevideo', 'Palmeiras', 'Peñarol', 'Platense',
      'Rosario Central', 'Sporting Cristal', 'Universidad Católica', 'Universidad Central',
      'Universitario',
    ],
  },
  {
    externalId: '4724',
    name: 'Copa Sul-Americana',
    country: 'Internacional',
    regionId: 'south-america',
    teamNames: [
      'Academia Puerto Cabello', 'Alianza Atlético', 'América de Cali', 'Atlético Mineiro',
      'Audax Italiano', 'Barracas Central', 'Blooming', 'Boston River', 'Botafogo',
      'Bragantino', 'Carabobo', 'Caracas', 'Cienciano', 'Club Olimpia', 'Deportivo Cuenca',
      'Deportivo Riestra', 'Grêmio', 'Independiente Petrolero', 'Juventud Las Piedras',
      'Macará', 'Millonarios', 'Montevideo City Torque',
      'O Higgins', // com apóstrofo ("O'Higgins") a busca não retorna nada
      'Palestino', 'Racing Club', 'Recoleta', 'River Plate',
      'id:135173', // San Lorenzo — a busca pelo nome só acha o time de basquete do clube
      'Santos', 'São Paulo', 'Tigre', 'Vasco da Gama',
    ],
  },
  // IDs reais confirmados via lookupleague.php (4356 era a A-League australiana,
  // e copa-america/eurocopa não eram IDs). Elencos enumerados contra a API em
  // 2026-07: todas as seleções existem no TheSportsDB com escudo disponível.
  {
    externalId: '4429',
    name: 'Copa do Mundo',
    country: 'Internacional',
    regionId: 'world',
    season: '2026',
    // Dois nomes fogem do oficial por limitação do índice do searchteams.php
    // (o nome gravado vem da resposta da API, não do termo buscado):
    // - 'Bosnia': a busca exata por 'Bosnia-Herzegovina' (com hífen) não acha nada;
    // - 'Jordania' (nome alternativo): a busca por 'Jordan' só retorna a equipe
    //   homônima extinta de Fórmula 1.
    teamNames: [
      'Algeria', 'Argentina', 'Australia', 'Austria', 'Belgium', 'Bosnia',
      'Brazil', 'Canada', 'Cape Verde', 'Colombia', 'Croatia', 'Curaçao',
      'Czech Republic', 'DR Congo', 'Ecuador', 'Egypt', 'England', 'France',
      'Germany', 'Ghana', 'Haiti', 'Iran', 'Iraq', 'Ivory Coast',
      'Japan', 'Jordania', 'Mexico', 'Morocco', 'Netherlands', 'New Zealand',
      'Norway', 'Panama', 'Paraguay', 'Portugal', 'Qatar', 'Saudi Arabia',
      'Scotland', 'Senegal', 'South Africa', 'South Korea', 'Spain', 'Sweden',
      'Switzerland', 'Tunisia', 'Turkey', 'USA', 'Uruguay', 'Uzbekistan',
    ],
  },
  {
    externalId: '4499',
    name: 'Copa América',
    country: 'Internacional',
    regionId: 'world',
    season: '2024',
    teamNames: [
      'Argentina', 'Bolivia', 'Brazil', 'Canada', 'Chile', 'Colombia',
      'Costa Rica', 'Ecuador', 'Jamaica', 'Mexico', 'Panama', 'Paraguay',
      'Peru', 'USA', 'Uruguay', 'Venezuela',
    ],
  },
  {
    externalId: '4502',
    name: 'Eurocopa',
    country: 'Internacional',
    regionId: 'world',
    season: '2024',
    // 'Sakartvelo' (nome alternativo da Geórgia): a busca por 'Georgia' só
    // retorna um time universitário americano — a seleção não está indexada
    // pelo nome em inglês no searchteams.php.
    teamNames: [
      'Albania', 'Austria', 'Belgium', 'Croatia', 'Czech Republic', 'Denmark',
      'England', 'France', 'Sakartvelo', 'Germany', 'Hungary', 'Italy',
      'Netherlands', 'Poland', 'Portugal', 'Romania', 'Scotland', 'Serbia',
      'Slovakia', 'Slovenia', 'Spain', 'Switzerland', 'Turkey', 'Ukraine',
    ],
  },
];
