# Chip de status de estudo na lista de ligas

**Data:** 2026-07-21
**Contexto:** Desde o design `2026-07-21-resumo-estudo-picker-design.md`, a tela de liga *selecionada* em `/estudo` mostra um card de resumo (memorizados, a revisitar, último estudo, próximo estudo) via `SrsService.getDeckSummary`. Mas a lista de ligas do país (antes de selecionar uma) não mostra nada sobre progresso de estudo — só o pill de status de importação (`Pronta para jogar` / `Ainda não importada` / `Em breve`). Como cada liga já tem esses dados calculados, faz sentido expor um resumo curto ali também, pra ajudar a escolher qual liga estudar sem precisar entrar em cada uma.

## Objetivo

Na lista de ligas de um país, quando a rota for `/estudo`, mostrar um chip adicional em cada liga já importada com o status de estudo daquela liga: nunca estudada, pronta pra revisar de novo, ou tudo em dia.

## Fora de escopo

- `/jogos` — o chip não aparece nessa rota (múltipla escolha/reverso não têm noção de "memorizado" por nível, mesma decisão já tomada pro card de resumo).
- Mudar o card de resumo da liga *selecionada* (já existe, não muda).
- Qualquer novo cálculo em `SrsService` — reaproveita `getDeckSummary` como está.

## Estados do chip

A partir do `DeckStudySummary` já retornado por `getDeckSummary(deckId)`:

| Condição | Texto | Cor |
|---|---|---|
| `lastStudiedAt === null` | "Novo" | azul (`.pill--info`) |
| `lastStudiedAt` existe e `nextStudyAvailable === true` | "Pronto pra estudar" | laranja (`.pill--warning`) |
| `nextStudyAvailable === false` | "Estudado" | verde (`.pill--success`, já existe) |

Ligas sem deck (nunca importadas) não mostram esse chip — só o pill de importação atual.

## `LeaguePicker` — buscar resumo de todos os decks

Hoje `studySummary` (singular) só é populado pro deck *selecionado*, via effect que depende de `selectedDeck()`. Para a lista de ligas, é preciso o resumo de *todo* deck existente, não só o selecionado.

Novo signal em `league-picker.ts`:

```typescript
readonly studySummaries = signal<Map<string, DeckStudySummary>>(new Map());
```

Populado por um novo effect, ao lado do que já chama `refreshDecks()`:

```typescript
effect(() => {
  this.importService.progress();
  void this.refreshDecksAndSummaries();
});
```

(substitui a chamada direta a `refreshDecks()` que já existe nesse effect). Novo método:

```typescript
private async refreshDecksAndSummaries(): Promise<void> {
  await this.refreshDecks();
  if (!this.showsAction('study')) {
    this.studySummaries.set(new Map());
    return;
  }
  const entries = await Promise.all(
    this.decks().map(async deck => [deck.id, await this.srsService.getDeckSummary(deck.id)] as const),
  );
  this.studySummaries.set(new Map(entries));
}
```

Isso busca o resumo de todo deck carregado (não só os do país atualmente selecionado) — mesmo padrão já usado por `refreshLeagues()`, que também carrega tudo de uma vez em vez de sob demanda por país. O custo é leituras locais no IndexedDB (rápidas), sem chamada de rede.

## Helper de estado do chip

Novo método em `league-picker.ts`, ao lado de `lastStudiedLabel`/`nextStudyLabel`:

```typescript
studyStatus(summary: DeckStudySummary): { text: string; variant: 'info' | 'warning' | 'success' } {
  if (!summary.lastStudiedAt) return { text: 'Novo', variant: 'info' };
  if (summary.nextStudyAvailable) return { text: 'Pronto pra estudar', variant: 'warning' };
  return { text: 'Estudado', variant: 'success' };
}
```

## Template (`league-picker.html`)

No bloco da lista de ligas do país (`league-list--single-column`), dentro de `league-card__footer`, ao lado do pill de importação existente:

```html
<div class="league-card__footer">
  @if (config.comingSoon) {
    <span class="pill">Em breve</span>
  } @else if (leagueDeck) {
    <span class="pill pill--success">Pronta para jogar</span>
  } @else {
    <span class="pill">Ainda não importada</span>
  }

  @if (showsAction('study') && leagueDeck && studySummaries().get(leagueDeck.id); as summary) {
    @let status = studyStatus(summary);
    <span
      class="pill"
      [class.pill--info]="status.variant === 'info'"
      [class.pill--warning]="status.variant === 'warning'"
      [class.pill--success]="status.variant === 'success'"
      data-testid="study-status-chip"
    >{{ status.text }}</span>
  }

  <span class="league-card__cta" ...>...</span>
</div>
```

(o `<span class="league-card__cta">` existente continua depois, sem mudança).

## Estilo (`styles.scss`)

Ao lado de `.pill--success` (linha ~410):

```scss
.pill--info {
  background: var(--blue-dim);
  color: var(--blue);
}

.pill--warning {
  background: var(--orange-dim);
  color: var(--orange);
}
```

Reaproveita os tokens `--blue`/`--blue-dim`/`--orange`/`--orange-dim` já definidos (claro e escuro) e já usados em `.deck-row__icon--blue` etc. — nenhum token novo.

## Testes (`league-picker.spec.ts`)

- Chip mostra "Novo" (`.pill--info`) pra uma liga com deck cujo resumo tem `lastStudiedAt: null`.
- Chip mostra "Pronto pra estudar" (`.pill--warning`) quando `lastStudiedAt` existe e `nextStudyAvailable: true`.
- Chip mostra "Estudado" (`.pill--success`) quando `nextStudyAvailable: false`.
- Chip ausente pra liga sem deck importado.
- Chip ausente inteiramente quando `actions` não inclui `'study'` (rota `/jogos`).
