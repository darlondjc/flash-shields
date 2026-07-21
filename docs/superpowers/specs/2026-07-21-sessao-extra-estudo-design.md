# Sessão de estudo extra + botão "Voltar" pra home dos estudos

**Data:** 2026-07-21
**Contexto:** Depois da refatoração do módulo de estudos, `StudyStore.load()` monta a fila do dia via `SrsService.buildDailyQueue()` (só cards vencidos + até `NEW_CARDS_PER_DAY` cards novos). Quando não há nada devido — seja porque o usuário já zerou a fila do dia, seja porque entrou em `/study/:deckId` sem nada pendente — a tela cai direto no estado "Sessão concluída" (`study.html`), que hoje só tem um botão "Voltar" chamando `back()`, que navega pra `/` (home geral do app). Não existe forma de estudar mais naquele momento, e o "Voltar" não leva pra home dos estudos (`/estudo`).

## Objetivo

1. No estado "Sessão concluída", oferecer um botão "Nova sessão extra" que reinicia o estudo ali mesmo, revisando o baralho inteiro da liga (ignorando `dueDate` e o limite de cards novos por dia).
2. O botão "Voltar" desse mesmo estado passa a levar pra `/estudo` (com a liga já selecionada), em vez de `/`.

## Fora de escopo

- Mudar o comportamento do `Home01Icon` do cabeçalho (`back()` → `/`) ou do `ArrowLeft02Icon` (`backToLeague()`) — ambos continuam existindo como estão hoje. Só o botão "Voltar" dentro do card de estado vazio muda de destino.
- Qualquer UI de "sessão extra" na tela `/estudo` (`LeaguePicker`) — o gatilho fica só dentro de `/study/:deckId`, no próprio estado vazio.
- Mudar o cálculo de `level`/`dueDate` do motor de SRS (`core/srs/level.ts`) — a sessão extra usa exatamente o mesmo `grade()`/`applyLevelGrade` de uma sessão normal.

## `SrsService.buildExtraQueue`

Novo método em `core/srs/srs.service.ts`, ao lado de `buildDailyQueue`:

```typescript
async buildExtraQueue(deckId: string): Promise<Team[]> {
  const deck = await this.deckService.getDeck(deckId);
  if (!deck) return [];

  const currentDate = today();
  const allStates = await this.db.reviewStates.where('deckId').equals(deckId).toArray();
  const existingTeamIds = new Set(allStates.map(state => state.teamId));

  const newTeamIds = deck.teamIds.filter(teamId => !existingTeamIds.has(teamId));
  for (const teamId of newTeamIds) {
    const state: StoredReviewState = {
      id: `${deckId}:${teamId}`,
      teamId,
      deckId,
      level: 0,
      dueDate: currentDate,
      lapses: 0,
      suspended: false,
    };
    await this.db.reviewStates.put(state);
  }

  const teams = await this.db.teams.bulkGet(shuffle(deck.teamIds));
  return teams.filter((team): team is Team => !!team);
}
```

Diferenças em relação a `buildDailyQueue`:
- Pega **todos** os `teamIds` do baralho, sem filtrar por `dueDate <= currentDate` nem por `suspended`.
- Não aplica o corte de `NEW_CARDS_PER_DAY` nos cards novos — todos os que ainda não têm `ReviewState` ganham um, igual hoje.
- Continua criando o `ReviewState` que falta pra cada card novo, porque `grade()` explode (`ReviewState not found`) se o estado não existir.

Cards suspensos entram na sessão extra propositalmente — é uma revisão livre, não a fila agendada.

## `StudyStore.startExtra()`

Novo método em `study.store.ts`, mesmo corpo de `load()` mas chamando `buildExtraQueue`:

```typescript
async startExtra() {
  const deckId = this.deckId();
  if (!deckId) return;
  const queue = await this.srs.buildExtraQueue(deckId);
  this.queue.set(queue);
  this.total.set(queue.length);
  this.revealed.set(false);
  this.answers.set([]);
  this.startedAt.set(new Date().toISOString());
}
```

Reaproveita o `deckId` já carregado (não recebe parâmetro). Dali em diante a sessão extra se comporta como uma sessão normal: `grade()` atualiza `level`/`dueDate` de verdade, e ao esvaziar a fila `finishSession()` grava uma `Session` normal (`mode: 'study'`) — ela entra nas mesmas contagens de `getDeckSummary` (`lastStudiedAt`, etc.) que uma sessão do dia.

## `study.html` / `study.ts`

Estado vazio ganha dois botões em vez de um:

```html
} @else {
  <section class="card empty-state">
    <p class="empty-state__title">Sessão concluída.</p>
    <p class="empty-state__subtitle">Você revisou todos os cartões de hoje.</p>
    <button type="button" class="btn btn--primary" data-testid="start-extra" (click)="store.startExtra()">Nova sessão extra</button>
    <button type="button" class="btn btn--ghost" (click)="backToLeague()">Voltar</button>
  </section>
}
```

`back()` continua existindo (é o handler do ícone "Início" no cabeçalho) mas deixa de ser usado pelo botão "Voltar" do estado vazio — esse passa a chamar `backToLeague()`, que já resolve o `externalId` da liga a partir do `deckId` e navega pra `/estudo?league=<externalId>`.

## Testes

- **`srs.service.spec.ts`**: `buildExtraQueue` inclui cards vencidos, não vencidos e suspensos; cria `ReviewState` pra cards nunca vistos, ignorando `NEW_CARDS_PER_DAY`; embaralha a ordem.
- **`study.store.spec.ts`**: `startExtra()` monta a fila a partir de `buildExtraQueue`, zera `answers`/`revealed`, e `grade()` numa sessão extra atualiza o `ReviewState` normalmente.
- **`study.spec.ts`**: o botão "Voltar" do estado vazio agora navega pra `/estudo` (com `?league=`) em vez de `/`; o botão "Nova sessão extra" chama `store.startExtra()` sem navegar.
