# Sessão de Estudo Extra + Botão "Voltar" pra Home dos Estudos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No estado "Sessão concluída" de `/study/:deckId`, deixar o usuário puxar uma sessão extra (baralho inteiro, ignorando `dueDate`) sem sair da tela, e trocar o botão "Voltar" desse estado pra navegar até a home dos estudos (`/estudo`) em vez da home geral do app (`/`).

**Architecture:** `SrsService` ganha `buildExtraQueue()`, um irmão de `buildDailyQueue()` que ignora `dueDate`/`suspended`/limite de cards novos. `StudyStore` ganha `startExtra()`, que espelha `load()` mas chama o novo método do serviço. `study.html` troca o botão único do estado vazio por dois, reaproveitando `backToLeague()` (já existente no componente) pro botão "Voltar".

**Tech Stack:** Angular 19 (standalone components, signals), Vitest, Dexie (IndexedDB) via `fake-indexeddb` nos testes.

## Global Constraints

- Sessão extra não filtra por `dueDate` nem por `suspended`, e não aplica o corte de `NEW_CARDS_PER_DAY` — pega todos os `teamIds` do baralho.
- Sessão extra cria `ReviewState` (level 0, dueDate hoje) pra qualquer card do baralho que ainda não tenha um, do mesmo jeito que `buildDailyQueue` já faz — sem isso, `grade()` lança `ReviewState not found`.
- Grades dadas numa sessão extra atualizam `level`/`dueDate` normalmente (mesmo `SrsService.grade()`/`applyLevelGrade` de sempre) — nenhuma lógica nova de "modo treino".
- O botão "Voltar" do estado vazio passa a chamar `backToLeague()` (não `back()`). O ícone "Início" do cabeçalho (`back()` → `/`) e o ícone de seta do cabeçalho (`backToLeague()` → `/estudo`) continuam exatamente como estão.
- Reaproveitar a classe `.btn--ghost` já existente em `src/styles.scss` pro botão secundário — não criar `.btn--secondary`.

---

### Task 1: `SrsService.buildExtraQueue`

**Files:**
- Modify: `src/app/core/srs/srs.service.ts`
- Test: `src/app/core/srs/srs.service.spec.ts`

**Interfaces:**
- Consumes: `DeckService.getDeck(deckId): Promise<Deck | undefined>`, `DbService.reviewStates` (Dexie table), `DbService.teams.bulkGet`, `shuffle<T>(items: readonly T[]): T[]` de `../util/random.util` (todos já usados por `buildDailyQueue` no mesmo arquivo).
- Produces: `SrsService.buildExtraQueue(deckId: string): Promise<Team[]>` — consumido pela `StudyStore.startExtra()` na Task 2.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do `describe('SrsService', ...)` em `src/app/core/srs/srs.service.spec.ts`, depois do bloco `describe('getDeckSummary', ...)` (antes do `});` final que fecha o describe de nível superior):

```typescript
  describe('buildExtraQueue', () => {
    it('includes teams with no ReviewState yet as new cards', async () => {
      const queue = await service.buildExtraQueue(deckId);
      expect(queue.map(t => t.id).sort()).toEqual(['ts-1', 'ts-2', 'ts-3']);
    });

    it('persists a fresh, due ReviewState for each new card it queues', async () => {
      await service.buildExtraQueue(deckId);
      const state = await db.reviewStates.get(`${deckId}:ts-1`);
      expect(state).toBeDefined();
      expect(state?.level).toBe(0);
      expect(state?.dueDate).toBe(today());
    });

    it('includes cards that are not due yet', async () => {
      await service.buildDailyQueue(deckId);
      await service.grade(deckId, 'ts-1', 'facil'); // pushes ts-1's dueDate into the future

      const queue = await service.buildExtraQueue(deckId);
      expect(queue.map(t => t.id).sort()).toEqual(['ts-1', 'ts-2', 'ts-3']);
    });

    it('includes suspended cards', async () => {
      await service.buildDailyQueue(deckId);
      const state = await db.reviewStates.get(`${deckId}:ts-1`);
      await db.reviewStates.put({ ...state!, suspended: true });

      const queue = await service.buildExtraQueue(deckId);
      expect(queue.map(t => t.id)).toContain('ts-1');
    });

    it('shuffles the queue order instead of always presenting the same team first', async () => {
      const manyTeams = Array.from({ length: 20 }, (_, i) => makeTeam(`ts-${i}`));
      await db.teams.bulkPut(manyTeams);
      const deck = await deckService.createLeagueDeck({
        id: 'ts-4328',
        externalIds: {},
        name: 'Premier League',
        country: 'England',
        regionId: 'europe',
        sport: 'soccer',
      });

      const insertionOrder = deck.teamIds;
      const queue = await service.buildExtraQueue(deck.id);

      expect(queue.map(t => t.id)).not.toEqual(insertionOrder);
    });
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/app/core/srs/srs.service.spec.ts`
Expected: FAIL — `service.buildExtraQueue is not a function`

- [ ] **Step 3: Implementar `buildExtraQueue`**

Em `src/app/core/srs/srs.service.ts`, adicionar o método logo depois de `buildDailyQueue` (que termina na linha 56 hoje):

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

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/app/core/srs/srs.service.spec.ts`
Expected: PASS (todos os testes do arquivo, incluindo os 5 novos)

- [ ] **Step 5: Commit**

```bash
git add src/app/core/srs/srs.service.ts src/app/core/srs/srs.service.spec.ts
git commit -m "feat(srs): add SrsService.buildExtraQueue for on-demand practice sessions"
```

---

### Task 2: `StudyStore.startExtra()`

**Files:**
- Modify: `src/app/features/study/study.store.ts`
- Test: `src/app/features/study/study.store.spec.ts`

**Interfaces:**
- Consumes: `SrsService.buildExtraQueue(deckId: string): Promise<Team[]>` (Task 1).
- Produces: `StudyStore.startExtra(): Promise<void>` — consumido pelo template `study.html` na Task 3, via `store.startExtra()`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do `describe('StudyStore', ...)` em `src/app/features/study/study.store.spec.ts`, e estender o `srsSpy` pra incluir o novo método mockado:

```typescript
  srsSpy = { buildDailyQueue: vi.fn(), buildExtraQueue: vi.fn(), grade: vi.fn() };
```

(troca a linha existente no `beforeEach`, que hoje é `srsSpy = { buildDailyQueue: vi.fn(), grade: vi.fn() };`)

E também troca a assinatura de `srsSpy` declarada no topo do describe:

```typescript
  let srsSpy: { buildDailyQueue: ReturnType<typeof vi.fn>; buildExtraQueue: ReturnType<typeof vi.fn>; grade: ReturnType<typeof vi.fn> };
```

Depois, adicionar estes casos ao final do arquivo, antes do `});` que fecha o `describe('StudyStore', ...)`:

```typescript
  it('startExtra() loads the extra queue for the already-loaded deck', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([]);
    srsSpy.buildExtraQueue.mockResolvedValue([makeTeam('ts-1'), makeTeam('ts-2')]);
    await store.load('deck-1');

    await store.startExtra();

    expect(srsSpy.buildExtraQueue).toHaveBeenCalledWith('deck-1');
    expect(store.current()?.id).toBe('ts-1');
    expect(store.remaining()).toBe(2);
    expect(store.revealed()).toBe(false);
  });

  it('startExtra() resets answers so a prior session does not leak into the new one', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1')]);
    srsSpy.grade.mockResolvedValue(1);
    await store.load('deck-1');
    store.reveal();
    await store.grade('acertou'); // finishes the daily session, records one answer

    srsSpy.buildExtraQueue.mockResolvedValue([makeTeam('ts-2')]);
    srsSpy.grade.mockResolvedValue(1);
    await store.startExtra();
    store.reveal();
    await store.grade('facil');

    const answers = sessionServiceSpy.finish.mock.calls[1][2];
    expect(answers).toEqual([expect.objectContaining({ teamId: 'ts-2', correct: true })]);
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/app/features/study/study.store.spec.ts`
Expected: FAIL — `store.startExtra is not a function`

- [ ] **Step 3: Implementar `startExtra()`**

Em `src/app/features/study/study.store.ts`, adicionar o método logo depois de `load()` (que termina na linha 34 hoje):

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

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/app/features/study/study.store.spec.ts`
Expected: PASS (todos os testes do arquivo, incluindo os 2 novos)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/study/study.store.ts src/app/features/study/study.store.spec.ts
git commit -m "feat(study): add StudyStore.startExtra to restart the queue on demand"
```

---

### Task 3: Botões "Nova sessão extra" e "Voltar" no estado vazio

**Files:**
- Modify: `src/app/features/study/study.html`
- Test: `src/app/features/study/study.spec.ts`

**Interfaces:**
- Consumes: `StudyStore.startExtra()` (Task 2), `Study.backToLeague()` (já existe em `study.ts:43-52`).
- Produces: nenhuma — última task da cadeia.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/app/features/study/study.spec.ts`, o `TestBed` atual não injeta `DeckService`, e `backToLeague()` depende dele. Trocar o `beforeEach` pra injetar um mock e um `Router` espiável, e adicionar o estado vazio ao `storeSpy`.

Primeiro, os imports no topo do arquivo ganham:

```typescript
import { Router, provideRouter } from '@angular/router';
import { DeckService } from '../../core/decks/deck.service';
import { Deck } from '../../core/models/deck.model';
```

(a linha `import { provideRouter } from '@angular/router';` já existe — só junta o `Router` nela.)

O `storeSpy` ganha `startExtra`:

```typescript
  let storeSpy: {
    load: ReturnType<typeof vi.fn>;
    reveal: ReturnType<typeof vi.fn>;
    grade: ReturnType<typeof vi.fn>;
    startExtra: ReturnType<typeof vi.fn>;
    current: ReturnType<typeof signal<Team | null>>;
    remaining: ReturnType<typeof signal<number>>;
    total: ReturnType<typeof signal<number>>;
    revealed: ReturnType<typeof signal<boolean>>;
  };
```

E o `beforeEach` passa a ser:

```typescript
  beforeEach(async () => {
    storeSpy = {
      load: vi.fn().mockResolvedValue(undefined),
      reveal: vi.fn(),
      grade: vi.fn(),
      startExtra: vi.fn(),
      current: signal(makeTeam('ts-1')),
      remaining: signal(1),
      total: signal(1),
      revealed: signal(false),
    };

    const deck: Deck = {
      id: 'deck-1',
      name: 'Premier League',
      scope: { kind: 'league', leagueId: 'ts-4328' },
      teamIds: ['ts-1'],
      createdAt: new Date().toISOString(),
    };
    const deckServiceSpy = { getDeck: vi.fn().mockResolvedValue(deck) };

    await TestBed.configureTestingModule({
      imports: [Study],
      providers: [
        provideRouter([]),
        { provide: StudyStore, useValue: storeSpy },
        { provide: DeckService, useValue: deckServiceSpy },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Study);
    fixture.componentRef.setInput('deckId', 'deck-1');
  });
```

Por fim, adicionar estes dois casos ao final do arquivo, antes do `});` que fecha o `describe('Study', ...)`:

```typescript
  it('shows "Nova sessão extra" and "Voltar" when the queue is empty, and starts an extra session on click', () => {
    storeSpy.current.set(null);
    fixture.detectChanges();

    const startExtraButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="start-extra"]');
    expect(startExtraButton).toBeTruthy();

    startExtraButton.click();
    expect(storeSpy.startExtra).toHaveBeenCalled();
  });

  it('"Voltar" in the empty state navigates to /estudo with the league preselected', async () => {
    storeSpy.current.set(null);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const backButton: HTMLButtonElement = Array.from(
      fixture.nativeElement.querySelectorAll('.empty-state button'),
    ).find((btn: HTMLButtonElement) => btn.textContent?.trim() === 'Voltar') as HTMLButtonElement;
    expect(backButton).toBeTruthy();

    backButton.click();
    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith(['/estudo'], { queryParams: { league: '4328' } });
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/app/features/study/study.spec.ts`
Expected: FAIL — `start-extra` não encontrado no primeiro teste; `Voltar` continua chamando `back()` (navega pra `['/']`) no segundo, então o `toHaveBeenCalledWith` não bate.

- [ ] **Step 3: Atualizar o template**

Em `src/app/features/study/study.html`, trocar o bloco do estado vazio (linhas 62-66 hoje):

```html
    <section class="card empty-state">
      <p class="empty-state__title">Sessão concluída.</p>
      <p class="empty-state__subtitle">Você revisou todos os cartões de hoje.</p>
      <button type="button" class="btn btn--primary" (click)="back()">Voltar</button>
    </section>
```

por:

```html
    <section class="card empty-state">
      <p class="empty-state__title">Sessão concluída.</p>
      <p class="empty-state__subtitle">Você revisou todos os cartões de hoje.</p>
      <button type="button" class="btn btn--primary" data-testid="start-extra" (click)="store.startExtra()">Nova sessão extra</button>
      <button type="button" class="btn btn--ghost" (click)="backToLeague()">Voltar</button>
    </section>
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/app/features/study/study.spec.ts`
Expected: PASS (todos os testes do arquivo, incluindo os 2 novos)

- [ ] **Step 5: Rodar a suíte inteira pra garantir que nada mais quebrou**

Run: `npx vitest run`
Expected: PASS em todos os arquivos

- [ ] **Step 6: Commit**

```bash
git add src/app/features/study/study.html src/app/features/study/study.spec.ts
git commit -m "feat(study): offer an extra session and route the empty-state back button to /estudo"
```
