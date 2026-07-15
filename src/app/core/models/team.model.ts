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
  // escudo é a pergunta (estudo). Gerada offline por scripts/question-badges.mjs
  // (edição de imagem via Gemini); ausente quando o escudo original não tem
  // nome legível ou a variante ainda não foi gerada.
  badgeQuestionUrl?: string;
  // Variante equivalente usada nos Jogos, gerada por scripts/game-badges.mjs:
  // detecção de texto via PaddleOCR + blur da região encontrada (mais
  // confiável que a Study para nomes em curva/estilizados). Pipeline
  // separado da badgeQuestionUrl porque a detecção roda em CI (GitHub
  // Actions) e a publicação exige revisão manual antes de virar campo real.
  badgeGameUrl?: string;
  badgeLocalKey?: string;
  founded?: number;
  colors?: string;
  stadium?: string;
  website?: string;
}
