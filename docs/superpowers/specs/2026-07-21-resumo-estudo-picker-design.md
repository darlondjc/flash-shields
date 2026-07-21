# Resumo de estudo + memória da última liga no picker

**Data:** 2026-07-21
**Contexto:** A tela `/estudo` (`LeaguePicker`, compartilhado com `/jogos`) hoje sempre abre na lista de países, mesmo que o usuário já tenha estudado uma liga antes — força reselecionar país → liga toda vez. Além disso, a tela não mostra nenhum resumo do progresso de estudo daquela liga (quantos cards já foram memorizados, quantos faltam revisar, quando foi a última vez, quando é a próxima). O motor de nível (`core/srs/level.ts`, ver `docs/superpowers/specs/2026-07-21-nivel-dominio-sessoes-estudo-design.md`) já registra `level`, `dueDate`, `lapses` por `ReviewState`, mas não a última nota dada — falta esse dado pra "memorizado" no sentido que o usuário quer (última resposta foi "fácil").

## Objetivo

1. Ao entrar em `/estudo` (ou `/jogos`), pular direto pra liga estudada/jogada por último, em vez de sempre mostrar a lista de países.
2. Mostrar, na tela de liga selecionada de `/estudo`, um card de resumo com: cards memorizados, cards a revisitar, último estudo, próximo estudo previsto.

## Fora de escopo nesta entrega

- Qualquer resumo equivalente em `/jogos` — o card de resumo é específico do fluxo de Estudo (SRS); múltipla escolha e reverso não têm noção de "memorizado" por nível.
- UI para suspender cards manualmente (`ReviewState.suspended` continua sempre `false` na prática, só é respeitado nos filtros por já existir no modelo).
- Mudar o cálculo de `level`/`dueDate` já existente — este design só adiciona um campo novo (`lastGrade`) e lê os dados existentes, não altera o motor de progressão.

## Modelo de dados

`core/models/review-state.model.ts` — um campo novo, opcional (não indexado, não exige bump de versão do Dexie):

```typescript
export interface ReviewState {
  teamId: string;
  deckId: string;
  level: number;
  dueDate: string;
  lastReviewed?: string;
  lastGrade?: ReviewGrade;   // novo — última nota dada a este card
  lapses: number;
  suspended: boolean;
}
```

`core/srs/level.ts` — `applyLevelGrade` grava `lastGrade: grade` no estado retornado, sempre (mesmo quando o nível não muda, ex. "difícil" mantendo o nível atual). "Memorizado" = `lastGrade === 'facil'`; qualquer outra nota subsequente no mesmo card remove essa condição na próxima leitura, mesmo que o nível continue alto.

## Cálculo do resumo: `SrsService.getDeckSummary`

Novo método em `core/srs/srs.service.ts` (mesmo serviço que já concentra consultas de `ReviewState`):

```typescript
export interface DeckStudySummary {
  memorizedCount: number;
  toRevisitCount: number;
  lastStudiedAt: string | null;     // ISO da Session mais recente (mode='study') deste deck; null se nunca estudado
  nextStudyAvailable: boolean;      // true se toRevisitCount > 0
  nextStudyDueDate: string | null;  // menor dueDate futuro; só preenchido quando nextStudyAvailable é false
}

async getDeckSummary(deckId: string): Promise<DeckStudySummary> {
  const deck = await this.deckService.getDeck(deckId);
  const states = await this.db.reviewStates.where('deckId').equals(deckId).toArray();
  const currentDate = today();

  const memorizedCount = states.filter(s => !s.suspended && s.lastGrade === 'facil').length;

  const dueCount = states.filter(s => !s.suspended && s.dueDate <= currentDate).length;
  const newCount = (deck?.teamIds.length ?? 0) - states.length;
  const toRevisitCount = dueCount + Math.max(0, newCount);

  const sessions = await this.db.sessions.where('deckId').equals(deckId).toArray();
  const studySessions = sessions.filter(s => s.mode === 'study');
  const lastStudiedAt = studySessions.length
    ? studySessions.reduce((latest, s) => (s.startedAt > latest ? s.startedAt : latest), studySessions[0].startedAt)
    : null;

  const futureDueDates = states.filter(s => !s.suspended && s.dueDate > currentDate).map(s => s.dueDate);
  const nextStudyDueDate = toRevisitCount === 0 && futureDueDates.length
    ? futureDueDates.reduce((min, d) => (d < min ? d : min))
    : null;

  return { memorizedCount, toRevisitCount, lastStudiedAt, nextStudyAvailable: toRevisitCount > 0, nextStudyDueDate };
}
```

Definições confirmadas:
- **Memorizados**: cards cuja última nota dada foi "fácil". Sai da contagem assim que a mesma carta recebe qualquer outra nota.
- **A revisitar**: cards vencidos hoje (`dueDate <= hoje`) somados aos cards do baralho que nunca foram vistos (sem `ReviewState`).
- **Último estudo**: `startedAt` da `Session` mais recente com `mode === 'study'` para este deck (mesma fonte já usada em Estatísticas).
- **Próximo estudo previsto**: se há algo a revisitar agora, é imediato ("Agora"); só calcula uma data futura quando não há nada pendente hoje.

## Lembrar a última liga selecionada (`LeaguePicker`)

Duas chaves de `localStorage`, uma por rota (`estudo` e `jogos`), seguindo o padrão já usado em `theme.service.ts`:

```typescript
const LAST_LEAGUE_KEY_PREFIX = 'flash-shields.lastLeague.';
```

A chave final usa o path da rota atual, lido via `ActivatedRoute` (`route.snapshot.routeConfig?.path`) — `/estudo` e `/jogos` guardam seleções independentes.

- Em `selectLeague()`, após confirmar que a liga não é `comingSoon`, grava o `externalId` selecionado na chave da rota atual.
- Na inicialização (`restoreSelectionFromQueryParams`, renomeado/estendido), a ordem de restauração é: 1) `?league=` na query string (usado pelo fluxo "Trocar liga" vindo de `Study.backToLeague()`) tem prioridade; 2) na ausência de query param, cai pro valor salvo no `localStorage` para a rota atual.
- "Trocar país" / "Trocar liga" não apagam o valor salvo — a memória só muda quando uma liga é de fato selecionada com sucesso.

## UI: card de resumo (`league-picker.html` / `.ts`)

Aparece dentro do bloco "liga selecionada", entre o cabeçalho da liga e os botões de ação, e só quando `showsAction('study')` é verdadeiro (nunca em `/jogos`). Reaproveita o padrão visual `stat-row`/`stat-chip` já usado em Estatísticas:

```html
@if (showsAction('study') && studySummary(); as summary) {
  <div class="stat-row" data-testid="study-summary">
    <div class="stat-chip">
      <span class="stat-chip__value">{{ summary.memorizedCount }}</span>
      <span class="stat-chip__label">Memorizados</span>
    </div>
    <div class="stat-chip">
      <span class="stat-chip__value">{{ summary.toRevisitCount }}</span>
      <span class="stat-chip__label">A revisitar</span>
    </div>
    <div class="stat-chip">
      <span class="stat-chip__value">{{ lastStudiedLabel(summary.lastStudiedAt) }}</span>
      <span class="stat-chip__label">Último estudo</span>
    </div>
    <div class="stat-chip">
      <span class="stat-chip__value">{{ nextStudyLabel(summary) }}</span>
      <span class="stat-chip__label">Próximo estudo</span>
    </div>
  </div>
}
```

No componente: `studySummary = signal<DeckStudySummary | null>(null)`, populado por um `effect()` que observa `selectedDeck()` e chama `srsService.getDeckSummary(deck.id)` sempre que a liga selecionada muda (mesmo padrão do effect já existente para `importService.progress()`).

Funções auxiliares de formatação:
- `lastStudiedLabel(iso)`: `null` → "Nunca"; diferença de 0 dias → "Hoje"; 1 dia → "Ontem"; caso contrário → "Há N dias".
- `nextStudyLabel(summary)`: `nextStudyAvailable` → "Agora"; senão, diferença de dias até `nextStudyDueDate` → "Em N dias".

## Testes

- **`level.spec.ts`**: `applyLevelGrade` grava `lastGrade` igual à nota dada; uma nota diferente sobrescreve o `lastGrade` anterior mesmo quando o nível não muda (caso "difícil").
- **`srs.service.spec.ts`**: `getDeckSummary` — contagem de memorizados por `lastGrade`; `toRevisitCount` somando vencidos + novos nunca vistos; `lastStudiedAt` da sessão mais recente (ignorando sessões de outros decks/modos); `nextStudyAvailable`/`nextStudyDueDate` nos dois cenários (com e sem pendências hoje); deck sem nenhuma `ReviewState` ainda.
- **`league-picker.spec.ts`**: restaurar a última liga do `localStorage` ao montar sem `?league=` na URL; prioridade do `?league=` sobre o `localStorage` quando os dois existem; gravação no `localStorage` ao selecionar uma liga com sucesso; chaves independentes entre `actions=['study']` e `actions=['play','reverse']`; renderização do card de resumo (presente só quando `study` está nas ações, ausente em `/jogos`).
