# Resumo de Estudo + Memória da Última Liga Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/estudo`, skip straight to the last-studied league instead of always showing the country list, and show a per-deck study summary card (memorized cards, cards to revisit, last studied, next study) once a league is selected.

**Architecture:** A new optional `lastGrade` field on `ReviewState` (written by the existing level engine) backs a new `SrsService.getDeckSummary()` query method. `LeaguePicker` (shared by `/estudo` and `/jogos`) gains `localStorage`-backed last-selection memory, keyed by its `actions` input so the two routes never collide, plus a summary card rendered only for the `study` action, reusing the `stat-row`/`stat-chip` CSS already used in Estatísticas (promoted from `stats.scss` to the global stylesheet so both features can use it).

**Tech Stack:** Angular 19+ (standalone components, signals, `effect()`), Dexie (IndexedDB), Vitest via `ng test` (`@angular/build:unit-test`), `fake-indexeddb` for service specs.

## Global Constraints

- No Dexie version bump: `lastGrade` is a new, non-indexed field on `ReviewState` — old rows simply lack it until next graded.
- "Memorizado" = a card's last recorded grade was `'facil'`. Any other grade on that card removes it from the count on the next read.
- "A revisitar" = cards with `dueDate <= hoje` (already seen) **plus** cards in the deck with no `ReviewState` yet (never seen).
- "Último estudo" comes from the most recent `Session` with `mode === 'study'` for the deck (same source as the Estatísticas history), not from `ReviewState.lastReviewed`.
- "Próximo estudo previsto" shows "Agora" whenever there's anything to revisit today; it only computes a future date when nothing is pending.
- Last-selected-league memory is independent per route (`/estudo` vs `/jogos`), keyed off the component's `actions` input, not off the URL.
- Study summary card renders only when `showsAction('study')` is true — never on `/jogos`.
- Counters show bare numbers (no "X/total"); dates are relative ("Hoje", "Ontem", "Há N dias", "Em N dias").
- Follow the existing `localStorage` key convention from `theme.service.ts`/`import.service.ts`: `flash-shields:<topic>`.

---

### Task 1: SRS date/grade primitives (`lastGrade` + `daysBetween`)

**Files:**
- Modify: `src/app/core/models/review-state.model.ts`
- Modify: `src/app/core/srs/level.ts`
- Test: `src/app/core/srs/level.spec.ts`

**Interfaces:**
- Produces: `ReviewState.lastGrade?: ReviewGrade`; `applyLevelGrade(state, grade)` now also sets `lastGrade`; new `daysBetween(fromDateStr: string, toDateStr: string): number` exported from `core/srs/level.ts`, used by Task 5.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/core/srs/level.spec.ts` (after the last `});` closing `describe('applyLevelGrade', ...)`, i.e. after line 71), and add a new `import` at the top:

```typescript
import { applyLevelGrade, today, addDays, daysBetween } from './level';
```

(replaces the existing `import { applyLevelGrade, today, addDays } from './level';` on line 1)

```typescript
  it('stamps lastGrade with the grade that was given', () => {
    const state = makeState({ level: 1 });
    const result = applyLevelGrade(state, 'acertou');
    expect(result.lastGrade).toBe('acertou');
  });

  it('overwrites a previous lastGrade even when the level does not change', () => {
    const state = makeState({ level: 2, lastGrade: 'facil' });
    const result = applyLevelGrade(state, 'dificil');
    expect(result.lastGrade).toBe('dificil');
  });
});

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween(today(), today())).toBe(0);
  });

  it('returns a positive count when the second date is later', () => {
    expect(daysBetween(today(), addDays(today(), 3))).toBe(3);
  });

  it('returns a negative count when the second date is earlier', () => {
    expect(daysBetween(today(), addDays(today(), -2))).toBe(-2);
  });
});
```

Note: the two new `it` blocks for `lastGrade` go *inside* the existing `describe('applyLevelGrade', ...)` block (before its closing `});`), and the new `describe('daysBetween', ...)` goes right after it, at the top level of the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx ng test --include src/app/core/srs/level.spec.ts`
Expected: FAIL — `result.lastGrade` is `undefined`, and `daysBetween` is not exported from `./level`.

- [ ] **Step 3: Implement**

In `src/app/core/models/review-state.model.ts`, add the field (full file):

```typescript
export type ReviewGrade = 'errei' | 'dificil' | 'acertou' | 'facil';

export interface ReviewState {
  teamId: string;
  deckId: string;
  level: number;
  dueDate: string;
  lastReviewed?: string;
  lastGrade?: ReviewGrade;
  lapses: number;
  suspended: boolean;
}
```

In `src/app/core/srs/level.ts`, add `daysBetween` after `addDays` (after line 11) and add `lastGrade` inside `applyLevelGrade`'s return object:

```typescript
export function daysBetween(fromDateStr: string, toDateStr: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(toDateStr).getTime() - new Date(fromDateStr).getTime()) / msPerDay);
}
```

```typescript
export function applyLevelGrade(state: ReviewState, grade: ReviewGrade): ReviewState {
  const level = clampLevel(state.level + LEVEL_DELTA[grade]);
  return {
    ...state,
    level,
    lapses: grade === 'errei' ? state.lapses + 1 : state.lapses,
    dueDate: addDays(today(), LEVEL_INTERVAL_DAYS[level]),
    lastReviewed: today(),
    lastGrade: grade,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx ng test --include src/app/core/srs/level.spec.ts`
Expected: PASS, 13 tests (8 existing + 2 `lastGrade` + 3 `daysBetween`).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/models/review-state.model.ts src/app/core/srs/level.ts src/app/core/srs/level.spec.ts
git commit -m "feat(srs): record lastGrade on ReviewState and add daysBetween helper"
```

---

### Task 2: `SrsService.getDeckSummary`

**Files:**
- Modify: `src/app/core/srs/srs.service.ts`
- Test: `src/app/core/srs/srs.service.spec.ts`

**Interfaces:**
- Consumes: `ReviewState.lastGrade` (Task 1), `DeckService.getDeck(id): Promise<Deck | undefined>`, `DbService.reviewStates`/`DbService.sessions` (Dexie tables), `today()` from `core/srs/level.ts`.
- Produces: `export interface DeckStudySummary { memorizedCount: number; toRevisitCount: number; lastStudiedAt: string | null; nextStudyAvailable: boolean; nextStudyDueDate: string | null; }` and `SrsService.getDeckSummary(deckId: string): Promise<DeckStudySummary>`, used by Task 5.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/core/srs/srs.service.spec.ts`, inside the existing `describe('SrsService', ...)` block (before its final closing `});` on line 107). Also add `await db.sessions.clear();` to the existing `beforeEach` (right after `await db.reviewStates.clear();` on line 35):

```typescript
    await db.sessions.clear();
```

New tests (add before the final `});`):

```typescript
  describe('getDeckSummary', () => {
    it('returns zeroed-out stats for a deck with no ReviewState and no sessions yet', async () => {
      const summary = await service.getDeckSummary(deckId);
      expect(summary.memorizedCount).toBe(0);
      expect(summary.toRevisitCount).toBe(3);
      expect(summary.lastStudiedAt).toBeNull();
      expect(summary.nextStudyAvailable).toBe(true);
      expect(summary.nextStudyDueDate).toBeNull();
    });

    it('counts a card as memorized only when its lastGrade is "facil"', async () => {
      await service.buildDailyQueue(deckId);
      await service.grade(deckId, 'ts-1', 'facil');
      await service.grade(deckId, 'ts-2', 'acertou');

      const summary = await service.getDeckSummary(deckId);
      expect(summary.memorizedCount).toBe(1);
    });

    it('drops a card out of memorized once it is graded anything other than "facil" again', async () => {
      await service.buildDailyQueue(deckId);
      await service.grade(deckId, 'ts-1', 'facil');
      // grade() applies by id regardless of dueDate, so re-grading the same
      // card works even though "facil" just pushed it past today.
      await service.grade(deckId, 'ts-1', 'dificil');

      const summary = await service.getDeckSummary(deckId);
      expect(summary.memorizedCount).toBe(0);
    });

    it('counts toRevisit as due cards plus never-seen cards', async () => {
      await service.buildDailyQueue(deckId);
      await service.grade(deckId, 'ts-1', 'facil'); // pushed to a future dueDate, no longer due today

      const summary = await service.getDeckSummary(deckId);
      // ts-2 and ts-3 are still due today (level 0), ts-1 is not due -> 2 due + 0 new
      expect(summary.toRevisitCount).toBe(2);
    });

    it('reads lastStudiedAt from the most recent "study" session for this deck only', async () => {
      await db.sessions.bulkPut([
        { id: 's1', deckId, mode: 'study', startedAt: '2026-07-01T10:00:00.000Z', answers: [] },
        { id: 's2', deckId, mode: 'study', startedAt: '2026-07-10T10:00:00.000Z', answers: [] },
        { id: 's3', deckId, mode: 'multiple-choice', startedAt: '2026-07-20T10:00:00.000Z', answers: [] },
        { id: 's4', deckId: 'other-deck', mode: 'study', startedAt: '2026-07-15T10:00:00.000Z', answers: [] },
      ]);

      const summary = await service.getDeckSummary(deckId);
      expect(summary.lastStudiedAt).toBe('2026-07-10T10:00:00.000Z');
    });

    it('sets nextStudyAvailable when there is anything due or new today', async () => {
      await service.buildDailyQueue(deckId);
      const summary = await service.getDeckSummary(deckId);
      expect(summary.nextStudyAvailable).toBe(true);
      expect(summary.nextStudyDueDate).toBeNull();
    });

    it('computes nextStudyDueDate as the earliest future dueDate once nothing is pending today', async () => {
      await service.buildDailyQueue(deckId);
      await service.grade(deckId, 'ts-1', 'acertou'); // level 0 -> 1, due in 1 day
      await service.grade(deckId, 'ts-2', 'facil'); // level 0 -> 2, due in 3 days
      await service.grade(deckId, 'ts-3', 'facil'); // level 0 -> 2, due in 3 days

      const summary = await service.getDeckSummary(deckId);
      expect(summary.nextStudyAvailable).toBe(false);
      expect(summary.nextStudyDueDate).toBe(addDays(today(), 1));
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx ng test --include src/app/core/srs/srs.service.spec.ts`
Expected: FAIL — `service.getDeckSummary` is not a function.

- [ ] **Step 3: Implement**

In `src/app/core/srs/srs.service.ts`, add the `DeckStudySummary` interface and the method (full file):

```typescript
import { Injectable, inject } from '@angular/core';
import { DbService, StoredReviewState } from '../persistence/db.service';
import { DeckService } from '../decks/deck.service';
import { Team } from '../models/team.model';
import { ReviewGrade } from '../models/review-state.model';
import { applyLevelGrade, today } from './level';
import { NEW_CARDS_PER_DAY } from './srs.constants';
import { shuffle } from '../util/random.util';

export interface DeckStudySummary {
  memorizedCount: number;
  toRevisitCount: number;
  lastStudiedAt: string | null;
  nextStudyAvailable: boolean;
  nextStudyDueDate: string | null;
}

@Injectable({ providedIn: 'root' })
export class SrsService {
  private db = inject(DbService);
  private deckService = inject(DeckService);

  async buildDailyQueue(deckId: string): Promise<Team[]> {
    const deck = await this.deckService.getDeck(deckId);
    if (!deck) return [];

    const currentDate = today();
    const allStates = await this.db.reviewStates.where('deckId').equals(deckId).toArray();
    const statesByTeamId = new Map(allStates.map(state => [state.teamId, state]));

    const dueTeamIds = allStates
      .filter(state => !state.suspended && state.dueDate <= currentDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map(state => state.teamId);

    const newTeamIds = deck.teamIds
      .filter(teamId => !statesByTeamId.has(teamId))
      .slice(0, NEW_CARDS_PER_DAY);

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

    const queueTeamIds = [...shuffle(dueTeamIds), ...shuffle(newTeamIds)];
    const teams = await this.db.teams.bulkGet(queueTeamIds);
    return teams.filter((team): team is Team => !!team);
  }

  async grade(deckId: string, teamId: string, grade: ReviewGrade): Promise<number> {
    const id = `${deckId}:${teamId}`;
    const state = await this.db.reviewStates.get(id);
    if (!state) throw new Error(`ReviewState not found for ${id}`);

    const { id: _stateId, ...reviewState } = state;
    const updated = applyLevelGrade(reviewState, grade);
    await this.db.reviewStates.put({ ...updated, id });
    return updated.level;
  }

  async getDeckSummary(deckId: string): Promise<DeckStudySummary> {
    const deck = await this.deckService.getDeck(deckId);
    const states = await this.db.reviewStates.where('deckId').equals(deckId).toArray();
    const currentDate = today();

    const memorizedCount = states.filter(state => !state.suspended && state.lastGrade === 'facil').length;

    const dueCount = states.filter(state => !state.suspended && state.dueDate <= currentDate).length;
    const newCount = (deck?.teamIds.length ?? 0) - states.length;
    const toRevisitCount = dueCount + Math.max(0, newCount);

    const sessions = await this.db.sessions.where('deckId').equals(deckId).toArray();
    const studySessions = sessions.filter(session => session.mode === 'study');
    const lastStudiedAt = studySessions.length
      ? studySessions.reduce((latest, session) => (session.startedAt > latest ? session.startedAt : latest), studySessions[0].startedAt)
      : null;

    const futureDueDates = states
      .filter(state => !state.suspended && state.dueDate > currentDate)
      .map(state => state.dueDate);
    const nextStudyDueDate = toRevisitCount === 0 && futureDueDates.length
      ? futureDueDates.reduce((min, date) => (date < min ? date : min))
      : null;

    return {
      memorizedCount,
      toRevisitCount,
      lastStudiedAt,
      nextStudyAvailable: toRevisitCount > 0,
      nextStudyDueDate,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx ng test --include src/app/core/srs/srs.service.spec.ts`
Expected: PASS, 14 tests (7 existing + 7 new `getDeckSummary` tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/srs/srs.service.ts src/app/core/srs/srs.service.spec.ts
git commit -m "feat(srs): add SrsService.getDeckSummary for per-deck study stats"
```

---

### Task 3: Promote `stat-row`/`stat-chip` CSS to the global stylesheet

**Files:**
- Modify: `src/app/features/stats/stats.scss`
- Modify: `src/styles.scss`

**Interfaces:**
- Produces: `.stat-row`, `.stat-chip`, `.stat-chip__value`, `.stat-chip__label` become globally available classes (currently scoped to the `Stats` component only), consumed by Task 5's template in `LeaguePicker`.

This task has no test of its own — it's a pure CSS relocation with no selector or rule changes, verified by Task 3.5 (rerunning the existing Stats spec, which asserts on DOM structure, not computed styles) and visually by Task 5's manual check.

- [ ] **Step 1: Remove the rules from `stats.scss`**

Delete these four rule blocks from `src/app/features/stats/stats.scss` (currently lines 1-26):

```scss
.stat-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.stat-chip {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.stat-chip__value {
  font-size: 1.15rem;
  font-weight: 800;
}

.stat-chip__label {
  font-size: 0.72rem;
  color: var(--text-muted);
}
```

The file should now start directly with the `.empty-state` block.

- [ ] **Step 2: Add the rules to `src/styles.scss`**

Insert the same four blocks (unchanged) right after the `.deck-row__icon--green`/`--blue`/`--purple` rules and before `.league-card--selected` (or any other existing top-level location — exact position doesn't matter since these are independent rules, just keep them together as one block). Use the `.league-card__actions` rule (around line 428) as the anchor and insert immediately after it:

```scss
.stat-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.stat-chip {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.stat-chip__value {
  font-size: 1.15rem;
  font-weight: 800;
}

.stat-chip__label {
  font-size: 0.72rem;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Run the existing Stats test suite to confirm nothing broke**

Run: `npx ng test --include src/app/features/stats/stats.spec.ts`
Expected: PASS — same test count as before this change (this suite checks DOM content/classes, not CSS, so a pure stylesheet relocation should not affect it).

- [ ] **Step 4: Commit**

```bash
git add src/app/features/stats/stats.scss src/styles.scss
git commit -m "refactor(ui): promote stat-row/stat-chip to the global stylesheet"
```

---

### Task 4: Remember the last selected league per route (`LeaguePicker`)

**Files:**
- Modify: `src/app/features/league-picker/league-picker.ts:1-186`
- Test: `src/app/features/league-picker/league-picker.spec.ts`

**Interfaces:**
- Consumes: `LeaguePickerAction` (existing), `this.actions()` input signal (existing).
- Produces: `private lastLeagueKey(): string` and `private rememberSelection(config: LeagueImportConfig): void` on `LeaguePicker`; replaces `restoreSelectionFromQueryParams()` with `restoreLastSelection()` (same call site in the constructor).

- [ ] **Step 1: Write the failing tests**

In `src/app/features/league-picker/league-picker.spec.ts`, update the imports (replace the existing `import` block at the top with):

```typescript
import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { LeaguePicker } from './league-picker';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { LeagueService } from '../../core/leagues/league.service';
import { League } from '../../core/models/league.model';
```

Add an `afterEach` that clears `localStorage` (add right after the `beforeEach(async () => { ... });` block, before the first `it(...)`):

```typescript
  afterEach(() => {
    localStorage.clear();
  });
```

Add these new tests, inside the `describe('LeaguePicker', ...)` block, after the last existing `it(...)` (after the test ending at what is currently line 98, right before the final `});` that closes the describe block):

```typescript
  it('restores the last selected league from localStorage when there is no ?league query param', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    localStorage.setItem('flash-shields:last-league:study', '4328');
    fixture.componentRef.setInput('actions', ['study']);

    await settle();

    expect(fixture.nativeElement.querySelector('[data-testid="select-country"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="study-link"]')).toBeTruthy();
  });

  it('prefers the ?league query param over localStorage when both are set', async () => {
    localStorage.setItem('flash-shields:last-league:study', '4335');
    // This test builds its own fixture below (construction happens AFTER
    // this line), unlike the other tests which reuse the outer `fixture`
    // built in `beforeEach` (construction happens BEFORE their mock setup).
    // That reversed ordering means the constructor's own `refreshDecks()`
    // call — not just the effect's — can consume a queued `mockResolvedValueOnce`
    // here, so use a persistent `mockResolvedValue` instead: every call
    // (constructor's and the effect's) then returns the same deck regardless
    // of call order.
    deckServiceSpy.listDecks.mockResolvedValue([newDeck]);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [LeaguePicker],
      providers: [
        provideRouter([]),
        { provide: ImportService, useValue: importSpy },
        { provide: DeckService, useValue: deckServiceSpy },
        { provide: LeagueService, useValue: leagueServiceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ league: '4328' }) } } },
      ],
    }).compileComponents();

    const queryParamFixture = TestBed.createComponent(LeaguePicker);
    queryParamFixture.componentRef.setInput('actions', ['study']);
    queryParamFixture.detectChanges();
    await queryParamFixture.whenStable();
    queryParamFixture.detectChanges();

    expect(queryParamFixture.nativeElement.querySelector('[data-testid="study-link"]')).toBeTruthy();
  });

  it('remembers the selected league in localStorage under a key scoped to the current actions', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    fixture.componentRef.setInput('actions', ['study']);

    await selectFirstLeague();

    expect(localStorage.getItem('flash-shields:last-league:study')).toBe('4328');
    expect(localStorage.getItem('flash-shields:last-league:play-reverse')).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx ng test --include src/app/features/league-picker/league-picker.spec.ts`
Expected: FAIL on all three new tests — no `localStorage` restore/write logic exists yet, so the picker still shows the country list and never writes the key.

- [ ] **Step 3: Implement**

In `src/app/features/league-picker/league-picker.ts`, add the key prefix constant right after the imports (after line 17, before `export type LeaguePickerAction`):

```typescript
const LAST_LEAGUE_KEY_PREFIX = 'flash-shields:last-league:';
```

Replace the constructor (lines 57-69). **Important:** `restoreLastSelection()` must NOT be called directly in the constructor body — `this.actions()` (a component input) only reflects its real bound value *after* Angular applies inputs post-construction (true both for `componentRef.setInput()` in tests and the router's `withComponentInputBinding()` in production), so a synchronous constructor-time read would always see the input's default value instead. Call it from inside an `effect()` instead, which Angular flushes for the first time on the next change-detection pass — by then, whatever set the input (test code or the router) has already run, so the effect sees the correct value:

```typescript
  constructor() {
    this.refreshDecks();

    // `actions()` only holds its real bound value once Angular applies inputs
    // (which happens after the constructor runs), so this can't be called
    // directly above — effect() defers it to the first change-detection pass,
    // by which point the real value is in place.
    effect(() => {
      this.restoreLastSelection();
    });

    // Background imports (first-run boot import, or "Atualizar dados
    // importados" from Configurações) tick ImportService.progress as each
    // league lands, so this keeps the league/deck list live without the user
    // needing to leave and come back to this screen.
    effect(() => {
      this.importService.progress();
      void this.refreshDecks();
    });
  }
```

Replace `restoreSelectionFromQueryParams` (lines 75-84) with two methods:

```typescript
  private restoreLastSelection() {
    const externalId = this.route.snapshot.queryParamMap.get('league') ?? localStorage.getItem(this.lastLeagueKey());
    if (!externalId) return;

    const config = this.leagueConfigs.find(c => c.externalId === externalId);
    if (!config) return;

    this.selectedCountry.set(config.country);
    this.selected.set(config);
  }

  private lastLeagueKey(): string {
    return `${LAST_LEAGUE_KEY_PREFIX}${[...this.actions()].sort().join('-')}`;
  }
```

In `selectLeague` (lines 134-166), replace the two `this.selected.set(config);` calls with `this.rememberSelection(config);` — full method:

```typescript
  async selectLeague(config: LeagueImportConfig) {
    if (config.comingSoon) {
      this.error.set(`${config.name} em breve.`);
      return;
    }

    this.error.set(null);

    if (this.deckForLeague(config.externalId)) {
      this.rememberSelection(config);
      return;
    }

    this.importingId.set(config.externalId);
    try {
      const league = await this.importService.importLeague(config);
      const createdDeck = await this.deckService.createLeagueDeck(league);

      if (createdDeck) {
        const existingDecks = this.decks();
        const alreadyExists = existingDecks.some(deck => deck.id === createdDeck.id);
        this.decks.set(alreadyExists ? existingDecks : [...existingDecks, createdDeck]);
      }

      this.rememberSelection(config);
      void this.refreshDecks();
    } catch {
      this.selected.set(null);
      this.error.set('Falha ao importar. Tente novamente.');
    } finally {
      this.importingId.set(null);
    }
  }

  private rememberSelection(config: LeagueImportConfig) {
    this.selected.set(config);
    localStorage.setItem(this.lastLeagueKey(), config.externalId);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx ng test --include src/app/features/league-picker/league-picker.spec.ts`
Expected: PASS, 6 tests (3 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/league-picker/league-picker.ts src/app/features/league-picker/league-picker.spec.ts
git commit -m "feat(league-picker): remember the last selected league per action set"
```

---

### Task 5: Study summary card

**Files:**
- Modify: `src/app/features/league-picker/league-picker.ts`
- Modify: `src/app/features/league-picker/league-picker.html:94-108`
- Test: `src/app/features/league-picker/league-picker.spec.ts`

**Interfaces:**
- Consumes: `SrsService.getDeckSummary(deckId): Promise<DeckStudySummary>` (Task 2), `daysBetween`/`today` from `core/srs/level.ts` (Task 1), `.stat-row`/`.stat-chip*` global classes (Task 3).
- Produces: `LeaguePicker.studySummary: Signal<DeckStudySummary | null>`, `LeaguePicker.lastStudiedLabel(iso: string | null): string`, `LeaguePicker.nextStudyLabel(summary: DeckStudySummary): string`.

- [ ] **Step 1: Write the failing tests**

Add `SrsService` to the shared mock setup in `league-picker.spec.ts`. Update the imports (add one line):

```typescript
import { SrsService } from '../../core/srs/srs.service';
```

Add a `srsServiceSpy` declaration alongside the others (near `let leagueServiceSpy`):

```typescript
  let srsServiceSpy: { getDeckSummary: ReturnType<typeof vi.fn> };
```

In `beforeEach`, initialize it and provide it, alongside the other spies:

```typescript
    srsServiceSpy = {
      getDeckSummary: vi.fn().mockResolvedValue({
        memorizedCount: 0,
        toRevisitCount: 0,
        lastStudiedAt: null,
        nextStudyAvailable: true,
        nextStudyDueDate: null,
      }),
    };
```

and add `{ provide: SrsService, useValue: srsServiceSpy },` to the `providers` array in the main `TestBed.configureTestingModule` call, and also to the one added in Task 4's "prefers ?league" test.

Add these new tests, after the ones from Task 4:

```typescript
  it('shows the study summary card only when the study action is present', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    srsServiceSpy.getDeckSummary.mockResolvedValueOnce({
      memorizedCount: 5,
      toRevisitCount: 2,
      lastStudiedAt: null,
      nextStudyAvailable: true,
      nextStudyDueDate: null,
    });
    fixture.componentRef.setInput('actions', ['study']);

    await selectFirstLeague();

    expect(fixture.nativeElement.querySelector('[data-testid="study-summary"]')).toBeTruthy();
  });

  it('hides the study summary card for actions=["play","reverse"]', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    fixture.componentRef.setInput('actions', ['play', 'reverse']);

    await selectFirstLeague();

    expect(fixture.nativeElement.querySelector('[data-testid="study-summary"]')).toBeFalsy();
    expect(srsServiceSpy.getDeckSummary).not.toHaveBeenCalled();
  });

  it('renders the memorized and toRevisit counts as plain numbers', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    srsServiceSpy.getDeckSummary.mockResolvedValueOnce({
      memorizedCount: 12,
      toRevisitCount: 4,
      lastStudiedAt: null,
      nextStudyAvailable: true,
      nextStudyDueDate: null,
    });
    fixture.componentRef.setInput('actions', ['study']);

    await selectFirstLeague();

    const text = fixture.nativeElement.querySelector('[data-testid="study-summary"]').textContent;
    expect(text).toContain('12');
    expect(text).toContain('4');
  });

  it('labels lastStudiedAt as "Nunca" when the deck was never studied', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    srsServiceSpy.getDeckSummary.mockResolvedValueOnce({
      memorizedCount: 0,
      toRevisitCount: 3,
      lastStudiedAt: null,
      nextStudyAvailable: true,
      nextStudyDueDate: null,
    });
    fixture.componentRef.setInput('actions', ['study']);

    await selectFirstLeague();

    expect(fixture.nativeElement.querySelector('[data-testid="study-summary"]').textContent).toContain('Nunca');
  });

  it('labels nextStudy as "Agora" when nextStudyAvailable is true, and as days-out otherwise', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    srsServiceSpy.getDeckSummary.mockResolvedValueOnce({
      memorizedCount: 0,
      toRevisitCount: 0,
      lastStudiedAt: null,
      nextStudyAvailable: false,
      nextStudyDueDate: addDays(today(), 3),
    });
    fixture.componentRef.setInput('actions', ['study']);

    await selectFirstLeague();

    expect(fixture.nativeElement.querySelector('[data-testid="study-summary"]').textContent).toContain('Em 3 dias');
  });
```

Add the matching import at the top for the last test:

```typescript
import { today, addDays } from '../../core/srs/level';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx ng test --include src/app/features/league-picker/league-picker.spec.ts`
Expected: FAIL — `SrsService` isn't injected/provided by the component yet, `data-testid="study-summary"` doesn't exist, and the compile step will error on the missing provider until Step 3 lands (this is expected — implement immediately after confirming the test file itself is syntactically consistent with the current component).

- [ ] **Step 3: Implement**

In `src/app/features/league-picker/league-picker.ts`, add imports (extend the existing import list):

```typescript
import { SrsService, DeckStudySummary } from '../../core/srs/srs.service';
import { today, daysBetween } from '../../core/srs/level';
```

Add the injected service and the summary signal, alongside the existing injected services and signals:

```typescript
  private srsService = inject(SrsService);
```

```typescript
  readonly studySummary = signal<DeckStudySummary | null>(null);
```

Add a third `effect()` in the constructor, after the two existing ones (the `restoreLastSelection` effect and the `importService.progress` effect from Task 4):

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

Add the loader and the two label methods (near the other public methods, e.g. after `selectedDeck()`):

```typescript
  private async loadStudySummary(deckId: string) {
    this.studySummary.set(await this.srsService.getDeckSummary(deckId));
  }

  lastStudiedLabel(iso: string | null): string {
    if (!iso) return 'Nunca';
    const days = daysBetween(iso.slice(0, 10), today());
    if (days <= 0) return 'Hoje';
    if (days === 1) return 'Ontem';
    return `Há ${days} dias`;
  }

  nextStudyLabel(summary: DeckStudySummary): string {
    if (summary.nextStudyAvailable) return 'Agora';
    const days = summary.nextStudyDueDate ? daysBetween(today(), summary.nextStudyDueDate) : 0;
    return `Em ${days} dias`;
  }
```

In `src/app/features/league-picker/league-picker.html`, insert the summary card right after the `league-card__header` block and before `@if (selectedDeck(); as deck) {` (currently starting at line 110):

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

(inserted immediately before the existing `@if (selectedDeck(); as deck) {` line)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx ng test --include src/app/features/league-picker/league-picker.spec.ts`
Expected: PASS, 11 tests (6 from Task 4 + 5 new).

- [ ] **Step 5: Run the full test suite**

Run: `npx ng test`
Expected: PASS, no regressions in any other spec file.

- [ ] **Step 6: Manual check in the browser**

Run: `npm start` (or the project's existing dev-server command), open `/estudo`, select a league that has been studied before (or study one card first via `/study/:deckId` to generate a session and a graded card), navigate back to `/estudo`, and confirm:
- The country list is skipped and the studied league is shown directly.
- The summary card shows plausible numbers for Memorizados/A revisitar and a sensible label for Último estudo/Próximo estudo.
- The card is absent on `/jogos`.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/league-picker/league-picker.ts src/app/features/league-picker/league-picker.html src/app/features/league-picker/league-picker.spec.ts
git commit -m "feat(league-picker): show a study summary card for the selected league"
```
