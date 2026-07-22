# Chip de Status de Estudo na Lista de Ligas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na lista de ligas de um país (tela `/estudo` antes de selecionar uma liga específica), mostrar um chip com o status de estudo de cada liga já importada: "Novo", "Pronto pra estudar" ou "Estudado".

**Architecture:** `LeaguePicker` passa a buscar o `DeckStudySummary` de *todo* deck carregado (não só o selecionado) num `Map<deckId, DeckStudySummary>`, populado dentro do já-existente `refreshDecks()`. O card de resumo da liga selecionada (que já existe) passa a ler desse mesmo mapa via um `computed()`, em vez de fazer sua própria busca — elimina uma busca duplicada de `getDeckSummary` para o mesmo deck que aconteceria se as duas buscas (mapa + card selecionado) fossem independentes. O template ganha um novo chip na lista de países→ligas, ao lado do pill de importação já existente.

**Tech Stack:** Angular 21 (standalone components, signals), Vitest.

## Global Constraints

- O chip só aparece em `/estudo` (`showsAction('study') === true`); nunca em `/jogos`.
- O chip só aparece pra ligas que já têm deck importado (`deckForLeague(externalId)` truthy) — liga não importada continua mostrando só o pill "Ainda não importada".
- Fica **ao lado** do pill de importação existente, não o substitui.
- Estados e textos exatos: `lastStudiedAt === null` → **"Novo"** (`.pill--info`); `lastStudiedAt` existe e `nextStudyAvailable === true` → **"Pronto pra estudar"** (`.pill--warning`); `nextStudyAvailable === false` → **"Estudado"** (`.pill--success`, já existe).
- Reaproveitar os tokens de cor já definidos `--blue`/`--blue-dim` e `--orange`/`--orange-dim` (claro e escuro) em `src/styles.scss` — não criar tokens novos.
- Esta mudança **não altera nenhum cálculo em `SrsService`** — só consome `getDeckSummary` como já existe.
- O card de resumo da liga *selecionada* (`data-testid="study-summary"`) deve continuar funcionando exatamente como hoje — mesmo texto, mesmos testes existentes passando sem modificação.

---

### Task 1: Mapa de resumos por deck + chip de status na lista de ligas

**Files:**
- Modify: `src/app/features/league-picker/league-picker.ts`
- Modify: `src/app/features/league-picker/league-picker.html`
- Modify: `src/styles.scss`
- Test: `src/app/features/league-picker/league-picker.spec.ts`

**Interfaces:**
- Consumes: `SrsService.getDeckSummary(deckId: string): Promise<DeckStudySummary>` (já existe, inalterado).
- Produces: nenhuma — última task, feature completa e autocontida.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/app/features/league-picker/league-picker.spec.ts`, adicionar um helper ao lado de `selectFirstLeague` (depois da definição de `selectFirstLeague`, antes de `beforeEach`):

```typescript
  // Fica na lista de ligas do país (sem selecionar uma liga específica),
  // pra inspecionar o chip de status que aparece em cada card da lista.
  async function goToLeagueList() {
    await settle();
    fixture.nativeElement.querySelector('[data-testid="select-country"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
  }
```

Adicionar estes casos ao final do arquivo, antes do `});` que fecha o `describe('LeaguePicker', ...)`:

```typescript
  describe('study status chip in the league list', () => {
    it('shows "Novo" for an imported league that was never studied', async () => {
      deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
      srsServiceSpy.getDeckSummary.mockResolvedValueOnce({
        memorizedCount: 0,
        toRevisitCount: 1,
        lastStudiedAt: null,
        nextStudyAvailable: true,
        nextStudyDueDate: null,
      });
      fixture.componentRef.setInput('actions', ['study']);

      await goToLeagueList();

      const chip = fixture.nativeElement.querySelector('[data-testid="study-status-chip"]');
      expect(chip.textContent.trim()).toBe('Novo');
      expect(chip.classList.contains('pill--info')).toBe(true);
    });

    it('shows "Pronto pra estudar" for a studied league with cards due again', async () => {
      deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
      srsServiceSpy.getDeckSummary.mockResolvedValueOnce({
        memorizedCount: 2,
        toRevisitCount: 1,
        lastStudiedAt: '2026-07-01T10:00:00.000Z',
        nextStudyAvailable: true,
        nextStudyDueDate: null,
      });
      fixture.componentRef.setInput('actions', ['study']);

      await goToLeagueList();

      const chip = fixture.nativeElement.querySelector('[data-testid="study-status-chip"]');
      expect(chip.textContent.trim()).toBe('Pronto pra estudar');
      expect(chip.classList.contains('pill--warning')).toBe(true);
    });

    it('shows "Estudado" when nothing is due right now', async () => {
      deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
      srsServiceSpy.getDeckSummary.mockResolvedValueOnce({
        memorizedCount: 3,
        toRevisitCount: 0,
        lastStudiedAt: '2026-07-20T10:00:00.000Z',
        nextStudyAvailable: false,
        nextStudyDueDate: addDays(today(), 3),
      });
      fixture.componentRef.setInput('actions', ['study']);

      await goToLeagueList();

      const chip = fixture.nativeElement.querySelector('[data-testid="study-status-chip"]');
      expect(chip.textContent.trim()).toBe('Estudado');
      expect(chip.classList.contains('pill--success')).toBe(true);
    });

    it('shows no chip for a league that has not been imported yet', async () => {
      fixture.componentRef.setInput('actions', ['study']);

      await goToLeagueList();

      expect(fixture.nativeElement.querySelector('[data-testid="study-status-chip"]')).toBeFalsy();
    });

    it('shows no chip at all on /jogos, even for an imported league', async () => {
      deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
      fixture.componentRef.setInput('actions', ['play', 'reverse']);

      await goToLeagueList();

      expect(fixture.nativeElement.querySelector('[data-testid="study-status-chip"]')).toBeFalsy();
      expect(srsServiceSpy.getDeckSummary).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx ng test --include='**/league-picker.spec.ts'`
Expected: FAIL — os 5 novos testes não encontram `[data-testid="study-status-chip"]` (chip ainda não existe no template).

- [ ] **Step 3: Trocar o `studySummary` (signal + effect) por `studySummaries` (mapa) + `studySummary` (computed)**

Em `src/app/features/league-picker/league-picker.ts`, trocar a declaração do signal (linha 55 hoje):

```typescript
  readonly studySummary = signal<DeckStudySummary | null>(null);
```

por:

```typescript
  readonly studySummaries = signal<Map<string, DeckStudySummary>>(new Map());
```

Remover o terceiro `effect()` do construtor por completo (o que hoje chama `loadStudySummary`):

```typescript
    effect(() => {
      const deck = this.selectedDeck();
      if (!deck || !this.showsAction('study')) {
        this.studySummary.set(null);
        return;
      }
      void this.loadStudySummary(deck.id);
    });
```

Remover também o método privado `loadStudySummary`:

```typescript
  private async loadStudySummary(deckId: string) {
    this.studySummary.set(await this.srsService.getDeckSummary(deckId));
  }
```

No lugar onde esse método estava, adicionar um `computed()` com o mesmo nome público que ele alimentava (`studySummary`), pra o template do card selecionado (`@if (showsAction('study') && studySummary(); as summary)`) continuar funcionando sem nenhuma mudança:

```typescript
  readonly studySummary = computed(() => {
    const deck = this.selectedDeck();
    return deck ? (this.studySummaries().get(deck.id) ?? null) : null;
  });
```

(`computed` já está importado de `@angular/core` na linha 1 — nada a adicionar no import.)

- [ ] **Step 4: Popular o mapa dentro de `refreshDecks()`**

Trocar `refreshDecks()`:

```typescript
  private async refreshDecks() {
    this.decks.set(await this.deckService.listDecks());
    await this.refreshLeagues();
  }
```

por:

```typescript
  private async refreshDecks() {
    this.decks.set(await this.deckService.listDecks());
    await this.refreshLeagues();
    await this.refreshStudySummaries();
  }

  private async refreshStudySummaries() {
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

Isso cobre todo caller existente de `refreshDecks()` (chamada direta no construtor, o `effect()` que reage a `importService.progress()`, e a chamada depois de importar uma liga em `selectLeague()`) sem precisar tocar em nenhum deles.

- [ ] **Step 5: Adicionar o helper `studyStatus()`**

Em `src/app/features/league-picker/league-picker.ts`, ao lado de `lastStudiedLabel`/`nextStudyLabel`:

```typescript
  studyStatus(summary: DeckStudySummary): { text: string; variant: 'info' | 'warning' | 'success' } {
    if (!summary.lastStudiedAt) return { text: 'Novo', variant: 'info' };
    if (summary.nextStudyAvailable) return { text: 'Pronto pra estudar', variant: 'warning' };
    return { text: 'Estudado', variant: 'success' };
  }
```

- [ ] **Step 6: Adicionar o chip no template da lista de ligas**

Em `src/app/features/league-picker/league-picker.html`, dentro do bloco `@else if (!selected())` (lista de ligas do país), trocar o `<div class="league-card__footer">` inteiro:

```html
            <div class="league-card__footer">
              @if (config.comingSoon) {
                <span class="pill">Em breve</span>
              } @else if (leagueDeck) {
                <span class="pill pill--success">Pronta para jogar</span>
              } @else {
                <span class="pill">Ainda não importada</span>
              }
              <span class="league-card__cta" [attr.aria-label]="config.comingSoon ? 'Em breve' : (importingId() === config.externalId ? 'Importando' : 'Selecionar')">
                @if (config.comingSoon) {
                  <span>Em breve</span>
                } @else if (importingId() === config.externalId) {
                  <span>Importando...</span>
                } @else {
                  <hugeicons-icon [icon]="CheckmarkCircle02Icon" [size]="16" [strokeWidth]="2" color="currentColor" />
                }
              </span>
            </div>
```

por:

```html
            <div class="league-card__footer">
              <div class="league-card__badges">
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
              </div>
              <span class="league-card__cta" [attr.aria-label]="config.comingSoon ? 'Em breve' : (importingId() === config.externalId ? 'Importando' : 'Selecionar')">
                @if (config.comingSoon) {
                  <span>Em breve</span>
                } @else if (importingId() === config.externalId) {
                  <span>Importando...</span>
                } @else {
                  <hugeicons-icon [icon]="CheckmarkCircle02Icon" [size]="16" [strokeWidth]="2" color="currentColor" />
                }
              </span>
            </div>
```

(o `.league-card__badges` novo agrupa os dois pills, pra `justify-content: space-between` do `.league-card__footer` continuar jogando só duas coisas pras pontas — o grupo de pills de um lado, o CTA do outro.)

- [ ] **Step 7: Estilizar `.league-card__badges` e os dois pills novos**

Em `src/styles.scss`, logo depois de `.pill--success` (perto da linha 413):

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

E logo antes de `.league-card__footer` (ou depois, tanto faz — só precisa existir no arquivo):

```scss
.league-card__badges {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
```

- [ ] **Step 8: Rodar os testes e confirmar que passam**

Run: `npx ng test --include='**/league-picker.spec.ts'`
Expected: PASS — todos os testes do arquivo, incluindo os 5 novos e os já existentes (o card de resumo da liga selecionada precisa continuar passando sem nenhuma mudança nos seus próprios testes).

- [ ] **Step 9: Rodar a suíte inteira**

Run: `npx ng test`
Expected: PASS em todos os arquivos (a suíte tinha 198/198 antes desta task — confirmar que continua tudo verde, sem novas falhas em nenhum outro arquivo).

- [ ] **Step 10: Commit**

```bash
git add src/app/features/league-picker/league-picker.ts src/app/features/league-picker/league-picker.html src/app/features/league-picker/league-picker.spec.ts src/styles.scss
git commit -m "feat(league-picker): show a study status chip per league in the list"
```
