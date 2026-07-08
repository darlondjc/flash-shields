# Estatísticas — modo Jogo (Fase 2, primeira entrega)

**Data:** 2026-07-07
**Contexto:** Fase 1 (MVP) concluída e testada — import de liga, cache de escudos, modo Estudo (SM-2) e modo Jogo (múltipla escolha). Fase 2 tem três frentes independentes (modos de jogo novos, filtro por país/região, estatísticas). Esta spec cobre a primeira entrega da frente de estatísticas.

## Objetivo

Dar visibilidade de progresso no modo Jogo: quantas partidas foram jogadas, qual a precisão geral e por deck, e qual o melhor streak alcançado. Base pra métricas mais ricas (heatmap, curva de retenção, times problemáticos) que ficam pra uma entrega futura.

## Fora de escopo nesta entrega

- Sessões do modo Estudo (SRS). O modo Estudo já persiste progresso via `ReviewState`; sessão dedicada pra ele fica pra depois, se fizer falta.
- Heatmap de revisões, curva de retenção, times com mais lapses, precisão por país/região.
- Gravação de sessão abandonada no meio do round (usuário sai antes do round de Jogo terminar): essa sessão simplesmente não é registrada.
- Modos de jogo além de múltipla escolha (Digitar, Reverso, Contra o tempo entram em entregas futuras da Fase 2; o modelo já é extensível pra eles).

## Modelo de dados

Novo arquivo `core/models/session.model.ts`:

```typescript
export type GameMode = 'multiple-choice';

export interface SessionAnswer {
  teamId: string;
  correct: boolean;
  responseMs: number;
  answeredAt: string;
}

export interface Session {
  id: string;
  deckId: string;
  mode: GameMode;
  startedAt: string;
  endedAt?: string;
  answers: SessionAnswer[];
  score?: number;
}
```

`DbService` ganha uma tabela nova via upgrade incremental do Dexie:

```typescript
sessions!: Table<Session, string>;
// ...
this.version(2).stores({
  sessions: 'id, deckId, mode, startedAt',
});
```

As tabelas existentes (`leagues`, `teams`, `decks`, `reviewStates`, `badgeBlobs`) não mudam.

## Fluxo de gravação

`core/session/session.service.ts` (novo), único método necessário nesta entrega:

```typescript
finish(deckId: string, mode: GameMode, answers: SessionAnswer[], startedAt: string): Promise<Session>
```

Monta o `Session` (gera `id`, calcula `score` como contagem de `correct: true`, marca `endedAt`) e grava com `db.sessions.put()`.

`GameStore` (existente) ganha:
- `answers = signal<SessionAnswer[]>([])`, resetado em `load()` junto com `startedAt = signal<string | null>(null)` (setado em `load()`)
- um timestamp interno de quando a pergunta atual virou `current`, pra calcular `responseMs` em `select()`
- em `select()`, empilha o `SessionAnswer` correspondente (reaproveita a comparação `teamId === question.correctTeam.id` que já existe pra pontuação)
- quando `next()` faz `finished` virar `true`, chama `sessionService.finish(deckId, 'multiple-choice', this.answers(), this.startedAt()!)` uma vez

Trade-off aceito: se o usuário navegar pra fora antes do round terminar, nada é persistido pra aquele round. Simplicidade escolhida deliberadamente sobre robustez contra abandono — grava tudo de uma vez no fim, não uma escrita por resposta.

O componente `Game` não muda.

## Agregação

`features/stats/stats.store.ts` (novo), seguindo o mesmo padrão de `GameStore`/`StudyStore`: `load()` async que lê `db.sessions.toArray()` uma vez, cruza com `db.decks` pra nomes, e expõe via signals computados:

- `totalSessions` — `sessions.length`
- `overallAccuracy` — soma de `correct: true` / soma total de respostas, em todas as sessões
- `accuracyByDeck` — agrupado por `deckId`: `{ deckId, deckName, accuracy, sessionCount }[]`
- `bestStreakByMode` — por `mode`, maior sequência consecutiva de `correct: true` dentro de `answers[]` de qualquer sessão daquele modo

Tudo em memória sobre `toArray()` — sem necessidade de índices adicionais no Dexie no volume de dados esperado (dezenas/centenas de sessões).

## UI e rota

`features/stats/stats.ts` (novo componente standalone, mesmo padrão de `Game`/`Study`). Rota nova em `app.routes.ts`:

```typescript
{ path: 'stats', loadComponent: () => import('./features/stats/stats').then(m => m.Stats) }
```

Sem parâmetro — a tela agrega todos os decks, não é por deck individual.

Home ganha um link/botão "Estatísticas" ao lado dos decks existentes, reaproveitando o padrão visual já presente.

Layout: número de total de sessões e precisão geral em destaque no topo; lista por deck (nome + precisão) reaproveitando o padrão de lista da Home; melhor streak por modo por último (hoje só "Múltipla escolha" aparece, mas o layout comporta mais linhas quando os outros modos da Fase 2 chegarem). Estado vazio (nenhuma sessão registrada ainda) mostra uma mensagem simples convidando a jogar, sem gráfico vazio ou placeholder visual elaborado.

## Testes

- `session.service.spec.ts` — grava uma sessão e confirma que é recuperável, `score` calculado corretamente.
- `stats.store.spec.ts` — agregação com sessões mockadas (múltiplos decks, múltiplos modos futuros hipotéticos) e caso vazio (nenhuma sessão).
- `game.store.spec.ts` (extensão do existente) — cobre que `sessionService.finish` é chamado com os dados corretos quando o round termina, e que não é chamado antes disso.
- `stats.spec.ts` — componente renderiza os números agregados corretamente, inclusive estado vazio.
- E2E (Playwright, `e2e/`): verificar se a suíte existente cobre navegação a partir da Home; se cobrir só o fluxo de Jogo/Estudo hoje, adicionar um passo de navegação até `/stats`.
