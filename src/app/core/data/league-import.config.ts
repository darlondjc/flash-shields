export interface LeagueImportConfig {
  externalId: string;
  name: string;
  country: string;
  regionId: string;
  comingSoon?: boolean;
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
  { externalId: '4356', name: 'Copa do Mundo', country: 'Internacional', regionId: 'world', comingSoon: true },
  { externalId: 'copa-america', name: 'Copa América', country: 'Internacional', regionId: 'world', comingSoon: true },
  { externalId: 'eurocopa', name: 'Eurocopa', country: 'Internacional', regionId: 'world', comingSoon: true },
];
