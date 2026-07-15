export interface Team {
  id: string;
  externalIds: Record<string, string>;
  name: string;
  shortName?: string;
  alternateNames: string[];
  country: string;
  leagueIds: string[];
  badgeUrl: string;
  // Variante do escudo com o nome do time removido/censurado, pra telas onde o
  // escudo é a pergunta (estudo, jogos). Gerada offline por
  // scripts/question-badges.mjs; ausente quando o escudo original não tem nome
  // legível ou a variante ainda não foi gerada.
  badgeQuestionUrl?: string;
  badgeLocalKey?: string;
  founded?: number;
  colors?: string;
  stadium?: string;
  website?: string;
}
