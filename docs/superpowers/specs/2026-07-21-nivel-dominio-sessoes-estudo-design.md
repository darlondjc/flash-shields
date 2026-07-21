# Nível de domínio (SRS) + sessões de estudo

**Data:** 2026-07-21
**Contexto:** Modo Estudo hoje roda em cima de SM-2 (`core/srs/sm2.ts`), funcional e testado, mas com duas lacunas: o algoritmo tem mais complexidade do que o caso de uso (reconhecimento visual de escudo ↔ nome) precisa, e o modo Estudo nunca grava `Session`/`SessionAnswer` — só atualiza o `ReviewState` do card. Isso deixa a tela de Estatísticas cega pro modo Estudo (só agrega sessões de Jogo). Ver `docs/anki.md` pra origem da proposta de motor mais simples.

## Objetivo

1. Substituir o motor SM-2 por um modelo de nível de domínio fixo (0-5), mais simples de manter e adequado ao caso de uso.
2. Fazer o modo Estudo gravar sessão (mesmo padrão já usado pelo modo Jogo), habilitando estatísticas de estudo.
3. Entregar duas estatísticas novas: histórico de sessões de estudo e heatmap de revisões por dia.

## Fora de escopo nesta entrega

- Migração do `ReviewState` existente: a troca de versão do Dexie simplesmente reseta a tabela `reviewStates` (decisão explícita — perde o progresso atual, todo card volta a "nunca visto").
- Cards problemáticos (mais lapses) e distribuição por nível de domínio — ficam pra uma entrega futura de estatísticas, já viáveis em cima do `lapses`/`level` que este design introduz.
- Renomear os rótulos dos botões de avaliação na UI (Errei/Difícil/Bom/Fácil): já equivalem semanticamente aos rótulos mais longos do `docs/anki.md`, não precisam mudar.
- Modos de jogo além dos já existentes (múltipla escolha, reverso) e filtro por país/região — inalterados por este design.

## Modelo de dados

`core/models/review-state.model.ts` — reescrito, sem os campos de SM-2:

```typescript
export type ReviewGrade = 'errei' | 'dificil' | 'acertou' | 'facil';

export interface ReviewState {
  teamId: string;
  deckId: string;
  level: number;          // 0-5, nível de domínio do card
  dueDate: string;
  lastReviewed?: string;
  lapses: number;         // conta só "errei", histórico de esquecimento
  suspended: boolean;
}
```

`core/models/session.model.ts` — `GameMode` ganha um terceiro valor, sem renomear o tipo (menor diff; `stats.store.ts` já agrupa por `mode` automaticamente):

```typescript
export type GameMode = 'multiple-choice' | 'reverse' | 'study';
```

`SessionAnswer`/`Session` não mudam de forma.

`DbService` — nova versão do Dexie. Bump de versão sozinho **não** apaga dados (Dexie só recria índices se o schema mudar; o formato de string aqui é o mesmo, então registros antigos ficariam soltos sem `level`, quebrando o app em runtime). O reset precisa ser explícito via `.upgrade()`:

```typescript
this.version(3).stores({
  reviewStates: 'id, deckId, dueDate', // schema inalterado; upgrade abaixo é quem limpa os dados
}).upgrade(tx => tx.table('reviewStates').clear());
```

## Motor: `core/srs/level.ts` (substitui `sm2.ts`)

```typescript
const LEVEL_INTERVAL_DAYS = [0, 1, 3, 7, 30, 90];
const LEVEL_DELTA: Record<ReviewGrade, number> = {
  errei: -1,
  dificil: 0,
  acertou: 1,
  facil: 2,
};

export function applyLevelGrade(state: ReviewState, grade: ReviewGrade): ReviewState {
  const level = clamp(state.level + LEVEL_DELTA[grade], 0, 5);
  return {
    ...state,
    level,
    lapses: grade === 'errei' ? state.lapses + 1 : state.lapses,
    dueDate: addDays(today(), LEVEL_INTERVAL_DAYS[level]),
    lastReviewed: today(),
  };
}
```

Card novo entra com `level: 0` (igual ao comportamento atual de `buildDailyQueue`, que hoje cria o `StoredReviewState` inicial). `errei` é a única resposta que pode levar um card ao nível 0 vindo de outro nível, porque é a única com delta negativo — `dificil` mantém o nível atual (nunca reduz), `acertou` sobe 1, `facil` sobe 2 (pode pular o nível seguinte).

`srs.service.ts` — `grade()` passa a chamar `applyLevelGrade` e retornar o nível resultante (`Promise<number>` em vez de `Promise<void>`), pro `StudyStore` decidir a reinserção em relearning.

## Relearning na mesma sessão (`StudyStore`)

Quando o nível resultante de uma avaliação é `0`, o card é reinserido na fila local alguns cards à frente — posição `atual + 3` ou o fim da fila se sobrar menos que isso — em vez de simplesmente removido. Isso só acontece após "errei" (a única resposta que zera o nível a partir de um nível > 0); se o card já estava em 0 e a resposta foi "difícil" (mantém), ele continua reaparecendo até uma resposta que o tire do 0.

```typescript
async grade(grade: ReviewGrade) {
  const team = this.current();
  if (!team) return;
  const resultLevel = await this.srs.grade(this.deckId()!, team.id, grade);
  this.recordAnswer(team.id, grade);
  this.queue.update(q => {
    const rest = q.slice(1);
    if (resultLevel > 0) return rest;
    const insertAt = Math.min(rest.length, 3);
    return [...rest.slice(0, insertAt), team, ...rest.slice(insertAt)];
  });
  this.revealed.set(false);
  if (this.queue().length === 0) await this.finishSession();
}
```

## Gravação de sessão (`StudyStore` + `SessionService`)

Mesmo padrão já usado pelo `GameStore`:

- `answers = signal<SessionAnswer[]>([])` e `startedAt = signal<string | null>(null)`, ambos resetados em `load()`.
- Timestamp interno de quando o card virou `current`, pra calcular `responseMs` (contado a partir do `reveal()`, não da exibição do escudo — no modo Estudo o tempo relevante é "quanto tempo levou pra se avaliar depois de ver a resposta", não pra lembrar).
- `correct = grade !== 'errei'` em cada `SessionAnswer` empilhado.
- Quando a fila esvazia de verdade (nenhum card sobra nem pra relearning), chama `sessionService.finish(deckId, 'study', answers, startedAt)` — mesmo trade-off já aceito no modo Jogo: sessão abandonada no meio (usuário sai antes do fim) não é persistida.

O componente `Study` não muda; a tela de "sessão concluída" já existente passa a corresponder ao momento em que a sessão é de fato gravada.

## Estatísticas novas (`stats.store.ts` + `stats.html`)

- **Histórico de sessões de estudo**: filtra `sessions` por `mode === 'study'`, ordena por `startedAt` desc, expõe `{ startedAt, cardCount: answers.length, accuracy: score / answers.length }[]`. Lista em seção própria, mesmo padrão visual das listas existentes (`deck-accuracy-list`).
- **Heatmap de revisões**: agrupa `answeredAt` de todas as `SessionAnswer` de sessões `mode === 'study'` (só estudo — não conta respostas de modo Jogo, "revisão" aqui é especificamente SRS) por dia (`YYYY-MM-DD`), conta quantas revisões por dia, cobre os últimos ~90 dias, estilo GitHub (célula por dia, intensidade de cor por contagem).

Estado vazio (nenhuma sessão de estudo ainda) segue o padrão já usado: mensagem simples, sem placeholder visual elaborado.

## Testes

- `level.spec.ts` substitui `sm2.spec.ts`: os 4 deltas, clamp em 0 e 5, mapeamento de intervalo por nível, `lapses` incrementando só em "errei".
- `srs.service.spec.ts`: ajustar fixtures de `repetitions`/`easeFactor` para `level`; cobrir o retorno do nível resultante em `grade()`.
- `study.store.spec.ts`: reinserção em relearning (nível 0 volta pra fila, nível > 0 não volta), gravação de `SessionAnswer` por avaliação, `sessionService.finish` chamado uma vez só quando a fila zera de verdade.
- `stats.store.spec.ts`: histórico de sessões de estudo (ordenação, cálculo de acurácia) e agregação do heatmap (contagem por dia, sessões de Jogo não entram).
- E2E (Playwright): se a suíte cobrir o fluxo de Estudo até "sessão concluída", confirmar que uma sessão aparece em `/stats` depois.
