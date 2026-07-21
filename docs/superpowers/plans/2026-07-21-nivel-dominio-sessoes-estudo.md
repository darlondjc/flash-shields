# Nível de domínio (SRS) + sessões de estudo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SM-2 spaced-repetition engine with a simpler fixed-level (0-5) model, and make the Estudo mode record `Session`/`SessionAnswer` data like Jogo mode already does, so Estatísticas can show a study session history and a review heatmap.

**Architecture:** `core/srs/level.ts` replaces `core/srs/sm2.ts` as a pure function computing the next level/interval from a grade. `SrsService` and `StudyStore` are updated to carry `level`/`ReviewGrade` instead of `repetitions`/`easeFactor`/`ReviewQuality`. `StudyStore` gains the same session-recording pattern `GameStore` already uses (via `SessionService`), plus in-session requeueing when a card falls back to level 0. `StatsStore` gains two new derived views computed from `mode === 'study'` sessions.

**Tech Stack:** Angular 21 (standalone + Signals), TypeScript strict mode, Dexie/IndexedDB, Vitest (`@angular/build:unit-test` runner).

## Global Constraints

- UI button labels stay as-is: Errei / Difícil / Bom / Fácil (already equivalent to the longer labels in `docs/anki.md`; do not rename).
- All user-facing copy is Portuguese, matching the rest of the app.
- Existing `ReviewState` rows in IndexedDB are discarded on upgrade, not migrated — this is an explicit, approved decision, not an oversight.
- The review heatmap counts only `mode === 'study'` answers — Jogo-mode answers never count as "revisões".
- `GameMode` gains a `'study'` member; it is not renamed even though it now covers a non-game mode too (smaller diff, `stats.store.ts` already groups generically by `mode`).
- **Task order is load-bearing, not stylistic.** `ng test` builds the *entire* app before running anything, so any TypeScript error anywhere fails every test file, not just the one under test. This was verified directly: applying Tasks 1 → 2 → 3 → 4 below one at a time and running the full suite (`npx ng test --watch=false`) after each confirms every checkpoint compiles and passes (154, then 161, then 162, then 169 tests). Reordering Task 1 after Task 2 breaks the build in between, because Task 2's `StudyStore` calls `sessionService.finish(deckId, 'study', ...)`, which only type-checks once `GameMode` includes `'study'`.

---

### Task 1: Add `'study'` to `GameMode`

**Files:**
- Modify: `src/app/core/models/session.model.ts`
- Modify: `src/app/features/stats/stats.ts`

**Interfaces:**
- Produces: `GameMode = 'multiple-choice' | 'reverse' | 'study'` — consumed by Task 2 (`StudyStore.finishSession`) and Task 4 (`stats.store.ts`'s `session.mode === 'study'` filter)

This task has no new tests of its own: `stats.ts`'s `modeLabel('study')` case is exercised end-to-end once Task 4 adds a real `study`-mode session to assert against (`stats.spec.ts`, "shows Estudo as the mode label"). Here it only needs to keep the app compiling — verified by running the full suite below.

- [ ] **Step 1: Add `'study'` to the `GameMode` union**

In `src/app/core/models/session.model.ts`, change line 1:

```typescript
export type GameMode = 'multiple-choice' | 'reverse' | 'study';
```

- [ ] **Step 2: Fix the now-non-exhaustive `modeLabel` switch in `stats.ts`**

Adding a union member makes this switch non-exhaustive, which fails the build under `noImplicitReturns` (this repo's `tsconfig.json` has it on). In `src/app/features/stats/stats.ts`, update the switch (currently lines 40-47):

```typescript
  modeLabel(mode: GameMode): string {
    switch (mode) {
      case 'multiple-choice':
        return 'Múltipla escolha';
      case 'reverse':
        return 'Reverso';
      case 'study':
        return 'Estudo';
    }
  }
```

- [ ] **Step 3: Run the full suite to confirm nothing broke**

Run: `npx ng test --watch=false`
Expected: PASS — 32 test files, 154 tests (same totals as before this task; it only widens a type and satisfies the compiler).

- [ ] **Step 4: Commit**

```bash
git add src/app/core/models/session.model.ts src/app/features/stats/stats.ts
git commit -m "feat(session): add 'study' as a GameMode"
```

---

### Task 2: Level engine, `ReviewState`/`ReviewGrade` model, `SrsService`, `StudyStore`

**Files:**
- Create: `src/app/core/srs/level.ts`
- Create: `src/app/core/srs/level.spec.ts`
- Modify: `src/app/core/models/review-state.model.ts`
- Modify: `src/app/core/srs/srs.service.ts`
- Modify: `src/app/core/srs/srs.service.spec.ts`
- Modify: `src/app/features/study/study.store.ts`
- Modify: `src/app/features/study/study.store.spec.ts`
- Modify: `src/app/features/study/study.html`
- Delete: `src/app/core/srs/sm2.ts`
- Delete: `src/app/core/srs/sm2.spec.ts`

**Interfaces:**
- Consumes: `GameMode` including `'study'` (Task 1)
- Produces: `ReviewGrade = 'errei' | 'dificil' | 'acertou' | 'facil'` (`review-state.model.ts`)
- Produces: `ReviewState { teamId: string; deckId: string; level: number; dueDate: string; lastReviewed?: string; lapses: number; suspended: boolean }` (`review-state.model.ts`)
- Produces: `applyLevelGrade(state: ReviewState, grade: ReviewGrade): ReviewState`, `today(): string`, `addDays(dateStr: string, days: number): string` (`level.ts`)
- Produces: `SrsService.grade(deckId: string, teamId: string, grade: ReviewGrade): Promise<number>` — returns the resulting level
- Produces: `StudyStore.grade(grade: ReviewGrade): Promise<void>` — replaces the old `grade(quality: ReviewQuality)`
- Consumed by: Task 3 (`db.service.ts`'s `StoredReviewState extends ReviewState`, shape-agnostic so it isn't a hard dependency, but logically follows this task)

This whole task lands as one unit: `review-state.model.ts`, `srs.service.ts`, and `study.store.ts` all reference the same `ReviewState`/`ReviewGrade` shape, so splitting them across commits would leave the app non-compiling in between (verified: `study.store.ts` alone importing the old `ReviewQuality` after the model changes fails `TS2305`).

- [ ] **Step 1: Write the failing test for the level engine**

Create `src/app/core/srs/level.spec.ts`:

```typescript
import { applyLevelGrade, today, addDays } from './level';
import { ReviewState } from '../models/review-state.model';

function makeState(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    teamId: 'team-1',
    deckId: 'deck-1',
    level: 0,
    dueDate: today(),
    lapses: 0,
    suspended: false,
    ...overrides,
  };
}

describe('applyLevelGrade', () => {
  it('drops the level by 1 on "errei" and increments lapses', () => {
    const state = makeState({ level: 3, lapses: 1 });
    const result = applyLevelGrade(state, 'errei');
    expect(result.level).toBe(2);
    expect(result.lapses).toBe(2);
    expect(result.dueDate).toBe(addDays(today(), 3));
  });

  it('never drops the level below 0', () => {
    const state = makeState({ level: 0 });
    const result = applyLevelGrade(state, 'errei');
    expect(result.level).toBe(0);
    expect(result.dueDate).toBe(today());
  });

  it('keeps the level unchanged on "dificil" and does not count it as a lapse', () => {
    const state = makeState({ level: 2, lapses: 1 });
    const result = applyLevelGrade(state, 'dificil');
    expect(result.level).toBe(2);
    expect(result.lapses).toBe(1);
  });

  it('raises the level by 1 on "acertou"', () => {
    const state = makeState({ level: 1 });
    const result = applyLevelGrade(state, 'acertou');
    expect(result.level).toBe(2);
    expect(result.dueDate).toBe(addDays(today(), 3));
  });

  it('raises the level by 2 on "facil", possibly skipping the next level', () => {
    const state = makeState({ level: 1 });
    const result = applyLevelGrade(state, 'facil');
    expect(result.level).toBe(3);
    expect(result.dueDate).toBe(addDays(today(), 7));
  });

  it('never raises the level above 5', () => {
    const state = makeState({ level: 4 });
    const result = applyLevelGrade(state, 'facil');
    expect(result.level).toBe(5);
    expect(result.dueDate).toBe(addDays(today(), 90));
  });

  it('does not increment lapses on a non-"errei" grade', () => {
    const state = makeState({ level: 0, lapses: 2 });
    const result = applyLevelGrade(state, 'acertou');
    expect(result.lapses).toBe(2);
  });

  it('stamps lastReviewed with today', () => {
    const state = makeState({ level: 1 });
    const result = applyLevelGrade(state, 'acertou');
    expect(result.lastReviewed).toBe(today());
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx ng test --watch=false --include=src/app/core/srs/level.spec.ts`
Expected: FAIL — `Cannot find module './level'` (the file doesn't exist yet), and a second failure for `../models/review-state.model` still exporting the old `ReviewQuality`/`repetitions`/`easeFactor` shape.

- [ ] **Step 3: Rewrite the `ReviewState`/`ReviewGrade` model**

Replace the full contents of `src/app/core/models/review-state.model.ts`:

```typescript
export type ReviewGrade = 'errei' | 'dificil' | 'acertou' | 'facil';

export interface ReviewState {
  teamId: string;
  deckId: string;
  level: number;
  dueDate: string;
  lastReviewed?: string;
  lapses: number;
  suspended: boolean;
}
```

- [ ] **Step 4: Implement the level engine**

Create `src/app/core/srs/level.ts`:

```typescript
import { ReviewState, ReviewGrade } from '../models/review-state.model';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const LEVEL_INTERVAL_DAYS = [0, 1, 3, 7, 30, 90];
const MAX_LEVEL = LEVEL_INTERVAL_DAYS.length - 1;

const LEVEL_DELTA: Record<ReviewGrade, number> = {
  errei: -1,
  dificil: 0,
  acertou: 1,
  facil: 2,
};

function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(0, level));
}

export function applyLevelGrade(state: ReviewState, grade: ReviewGrade): ReviewState {
  const level = clampLevel(state.level + LEVEL_DELTA[grade]);
  return {
    ...state,
    level,
    lapses: grade === 'errei' ? state.lapses + 1 : state.lapses,
    dueDate: addDays(today(), LEVEL_INTERVAL_DAYS[level]),
    lastReviewed: today(),
  };
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx ng test --watch=false --include=src/app/core/srs/level.spec.ts`
Expected: PASS — 8 tests passed.

- [ ] **Step 6: Update `SrsService` to use the level engine**

In `src/app/core/srs/srs.service.ts`, replace the whole file:

```typescript
import { Injectable, inject } from '@angular/core';
import { DbService, StoredReviewState } from '../persistence/db.service';
import { DeckService } from '../decks/deck.service';
import { Team } from '../models/team.model';
import { ReviewGrade } from '../models/review-state.model';
import { applyLevelGrade, today } from './level';
import { NEW_CARDS_PER_DAY } from './srs.constants';
import { shuffle } from '../util/random.util';

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
}
```

- [ ] **Step 7: Update `srs.service.spec.ts` for the new contract**

Replace the whole file `src/app/core/srs/srs.service.spec.ts`:

```typescript
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { SrsService } from './srs.service';
import { DbService } from '../persistence/db.service';
import { DeckService } from '../decks/deck.service';
import { Team } from '../models/team.model';
import { today, addDays } from './level';

function makeTeam(id: string): Team {
  return {
    id,
    externalIds: { thesportsdb: id },
    name: `Team ${id}`,
    alternateNames: [],
    country: 'England',
    leagueIds: ['ts-4328'],
    badgeUrl: 'https://example.com/x.png',
  };
}

describe('SrsService', () => {
  let service: SrsService;
  let db: DbService;
  let deckService: DeckService;
  let deckId: string;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SrsService);
    db = TestBed.inject(DbService);
    deckService = TestBed.inject(DeckService);

    await db.teams.clear();
    await db.decks.clear();
    await db.reviewStates.clear();
    await db.teams.bulkPut([makeTeam('ts-1'), makeTeam('ts-2'), makeTeam('ts-3')]);
    const deck = await deckService.createLeagueDeck({
      id: 'ts-4328',
      externalIds: {},
      name: 'Premier League',
      country: 'England',
      regionId: 'europe',
      sport: 'soccer',
    });
    deckId = deck.id;
  });

  it('includes teams with no ReviewState yet as new cards', async () => {
    const queue = await service.buildDailyQueue(deckId);
    expect(queue.map(t => t.id).sort()).toEqual(['ts-1', 'ts-2', 'ts-3']);
  });

  it('persists a fresh, due ReviewState at level 0 for each new card it queues', async () => {
    await service.buildDailyQueue(deckId);
    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    expect(state).toBeDefined();
    expect(state?.level).toBe(0);
    expect(state?.dueDate).toBe(today());
  });

  it('excludes suspended cards from the queue', async () => {
    await service.buildDailyQueue(deckId);
    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    await db.reviewStates.put({ ...state!, suspended: true });

    const queue = await service.buildDailyQueue(deckId);
    expect(queue.map(t => t.id)).not.toContain('ts-1');
  });

  it('grade() applies the level engine, returns the resulting level, and persists it', async () => {
    await service.buildDailyQueue(deckId);
    const level = await service.grade(deckId, 'ts-1', 'acertou');

    expect(level).toBe(1);
    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    expect(state?.level).toBe(1);
    expect(state?.dueDate).toBe(addDays(today(), 1));
  });

  it('re-queues a card for today and counts a lapse after grading it "errei"', async () => {
    await service.buildDailyQueue(deckId);
    const level = await service.grade(deckId, 'ts-1', 'errei');

    expect(level).toBe(0);
    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    expect(state?.dueDate).toBe(today());
    expect(state?.lapses).toBe(1);
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
    const queue = await service.buildDailyQueue(deck.id);

    expect(queue.map(t => t.id)).not.toEqual(insertionOrder);
  });
});
```

- [ ] **Step 8: Run the SRS test suite to confirm it passes**

Run: `npx ng test --watch=false --include=src/app/core/srs/srs.service.spec.ts`
Expected: PASS — 6 tests passed.

- [ ] **Step 9: Delete the SM-2 files, now unreferenced**

```bash
git rm src/app/core/srs/sm2.ts src/app/core/srs/sm2.spec.ts
```

- [ ] **Step 10: Write the failing test for the new `StudyStore` behavior**

Replace the whole file `src/app/features/study/study.store.spec.ts`:

```typescript
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { StudyStore } from './study.store';
import { SrsService } from '../../core/srs/srs.service';
import { SessionService } from '../../core/session/session.service';
import { Team } from '../../core/models/team.model';
import { SessionAnswer } from '../../core/models/session.model';

function makeTeam(id: string): Team {
  return {
    id,
    externalIds: {},
    name: `Team ${id}`,
    alternateNames: [],
    country: 'England',
    leagueIds: [],
    badgeUrl: 'https://example.com/x.png',
  };
}

describe('StudyStore', () => {
  let store: StudyStore;
  let srsSpy: { buildDailyQueue: ReturnType<typeof vi.fn>; grade: ReturnType<typeof vi.fn> };
  let sessionServiceSpy: { finish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    srsSpy = { buildDailyQueue: vi.fn(), grade: vi.fn() };
    sessionServiceSpy = { finish: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        { provide: SrsService, useValue: srsSpy },
        { provide: SessionService, useValue: sessionServiceSpy },
      ],
    });
    store = TestBed.inject(StudyStore);
  });

  it('loads the daily queue for a deck', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1'), makeTeam('ts-2')]);
    await store.load('deck-1');
    expect(store.current()?.id).toBe('ts-1');
    expect(store.remaining()).toBe(2);
    expect(store.revealed()).toBe(false);
  });

  it('reveal() flips the revealed flag', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1')]);
    await store.load('deck-1');
    store.reveal();
    expect(store.revealed()).toBe(true);
  });

  it('grade() advances the queue and resets revealed when the card graduates', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1'), makeTeam('ts-2')]);
    srsSpy.grade.mockResolvedValue(1);
    await store.load('deck-1');
    store.reveal();

    await store.grade('acertou');

    expect(srsSpy.grade).toHaveBeenCalledWith('deck-1', 'ts-1', 'acertou');
    expect(store.current()?.id).toBe('ts-2');
    expect(store.revealed()).toBe(false);
  });

  it('re-inserts the card 3 positions later when it falls back to level 0', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([
      makeTeam('ts-1'), makeTeam('ts-2'), makeTeam('ts-3'), makeTeam('ts-4'),
    ]);
    srsSpy.grade.mockResolvedValue(0);
    await store.load('deck-1');
    store.reveal();

    await store.grade('errei');

    expect(store.remaining()).toBe(4);
    expect(store.queue().map(t => t.id)).toEqual(['ts-2', 'ts-3', 'ts-4', 'ts-1']);
  });

  it('re-inserts the card right after whatever remains when fewer than 3 cards are left', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1'), makeTeam('ts-2')]);
    srsSpy.grade.mockResolvedValue(0);
    await store.load('deck-1');
    store.reveal();

    await store.grade('errei');

    expect(store.queue().map(t => t.id)).toEqual(['ts-2', 'ts-1']);
  });

  it('records a session once the queue is fully cleared', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1')]);
    srsSpy.grade.mockResolvedValue(1);
    await store.load('deck-1');
    store.reveal();

    await store.grade('acertou');

    expect(sessionServiceSpy.finish).toHaveBeenCalledTimes(1);
    const [deckId, mode, answers] = sessionServiceSpy.finish.mock.calls[0];
    expect(deckId).toBe('deck-1');
    expect(mode).toBe('study');
    expect(answers).toEqual([expect.objectContaining({ teamId: 'ts-1', correct: true })]);
  });

  it('does not record a session while a relearning card still remains in the queue', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1')]);
    srsSpy.grade.mockResolvedValue(0);
    await store.load('deck-1');
    store.reveal();

    await store.grade('errei');

    expect(sessionServiceSpy.finish).not.toHaveBeenCalled();
  });

  it('marks "errei" answers as incorrect and every other grade as correct', async () => {
    srsSpy.buildDailyQueue.mockResolvedValue([makeTeam('ts-1'), makeTeam('ts-2')]);
    srsSpy.grade
      .mockResolvedValueOnce(0) // ts-1 errei -> relearn, reinserted
      .mockResolvedValueOnce(2) // ts-2 dificil -> graduates
      .mockResolvedValueOnce(1); // ts-1 (relearned) acertou -> graduates, queue empties
    await store.load('deck-1');

    store.reveal();
    await store.grade('errei');
    store.reveal();
    await store.grade('dificil');
    store.reveal();
    await store.grade('acertou');

    expect(sessionServiceSpy.finish).toHaveBeenCalledTimes(1);
    const answers = sessionServiceSpy.finish.mock.calls[0][2] as SessionAnswer[];
    expect(answers.map(a => ({ teamId: a.teamId, correct: a.correct }))).toEqual([
      { teamId: 'ts-1', correct: false },
      { teamId: 'ts-2', correct: true },
      { teamId: 'ts-1', correct: true },
    ]);
  });
});
```

- [ ] **Step 11: Run the test to confirm it fails**

Run: `npx ng test --watch=false --include=src/app/features/study/study.store.spec.ts`
Expected: FAIL — `SessionService` isn't injected by `StudyStore` yet, and `store.grade('acertou')` doesn't type-check against the old `grade(quality: ReviewQuality)` signature.

- [ ] **Step 12: Rewrite `StudyStore`**

Replace the whole file `src/app/features/study/study.store.ts`:

```typescript
import { Injectable, inject, signal, computed } from '@angular/core';
import { SrsService } from '../../core/srs/srs.service';
import { SessionService } from '../../core/session/session.service';
import { Team } from '../../core/models/team.model';
import { ReviewGrade } from '../../core/models/review-state.model';
import { SessionAnswer } from '../../core/models/session.model';

const RELEARN_INSERT_OFFSET = 3;

@Injectable({ providedIn: 'root' })
export class StudyStore {
  private srs = inject(SrsService);
  private sessionService = inject(SessionService);

  readonly deckId = signal<string | null>(null);
  readonly queue = signal<Team[]>([]);
  readonly total = signal(0);
  readonly current = computed(() => this.queue()[0] ?? null);
  readonly remaining = computed(() => this.queue().length);
  readonly revealed = signal(false);

  private answers = signal<SessionAnswer[]>([]);
  private startedAt = signal<string | null>(null);
  private revealedAt = 0;

  async load(deckId: string) {
    this.deckId.set(deckId);
    const queue = await this.srs.buildDailyQueue(deckId);
    this.queue.set(queue);
    this.total.set(queue.length);
    this.revealed.set(false);
    this.answers.set([]);
    this.startedAt.set(new Date().toISOString());
  }

  reveal() {
    this.revealed.set(true);
    this.revealedAt = Date.now();
  }

  async grade(grade: ReviewGrade) {
    const team = this.current();
    if (!team) return;

    const responseMs = Date.now() - this.revealedAt;
    const resultLevel = await this.srs.grade(this.deckId()!, team.id, grade);

    this.answers.update(list => [
      ...list,
      { teamId: team.id, correct: grade !== 'errei', responseMs, answeredAt: new Date().toISOString() },
    ]);

    this.queue.update(q => {
      const rest = q.slice(1);
      if (resultLevel > 0) return rest;
      const insertAt = Math.min(rest.length, RELEARN_INSERT_OFFSET);
      return [...rest.slice(0, insertAt), team, ...rest.slice(insertAt)];
    });
    this.revealed.set(false);

    if (this.queue().length === 0) {
      await this.finishSession();
    }
  }

  private async finishSession() {
    const deckId = this.deckId();
    const startedAt = this.startedAt();
    if (!deckId || !startedAt) return;
    try {
      await this.sessionService.finish(deckId, 'study', this.answers(), startedAt);
    } catch (err) {
      console.error(`StudyStore: failed to save session for deck ${deckId}`, err);
    }
  }
}
```

- [ ] **Step 13: Run the test to confirm it passes**

Run: `npx ng test --watch=false --include=src/app/features/study/study.store.spec.ts`
Expected: PASS — 8 tests passed.

- [ ] **Step 14: Update the grading buttons in `study.html`**

In `src/app/features/study/study.html`, replace the grade row (currently lines 42-59):

```html
    @if (store.revealed()) {
      <div class="grade-row">
        <button type="button" class="grade-btn grade-btn--red" (click)="store.grade('errei')">
          <span>Errei</span>
          <span class="grade-btn__key" aria-hidden="true">1</span>
        </button>
        <button type="button" class="grade-btn grade-btn--orange" (click)="store.grade('dificil')">
          <span>Difícil</span>
          <span class="grade-btn__key" aria-hidden="true">2</span>
        </button>
        <button type="button" class="grade-btn grade-btn--green" (click)="store.grade('acertou')">
          <span>Bom</span>
          <span class="grade-btn__key" aria-hidden="true">3</span>
        </button>
        <button type="button" class="grade-btn grade-btn--blue" (click)="store.grade('facil')">
          <span>Fácil</span>
          <span class="grade-btn__key" aria-hidden="true">4</span>
        </button>
      </div>
    }
```

- [ ] **Step 15: Run the whole suite to confirm this task's checkpoint is clean**

Run: `npx ng test --watch=false`
Expected: PASS — 32 test files, 161 tests (154 from Task 1's checkpoint, minus the 6 deleted `sm2.spec.ts` tests, plus 8 new `level.spec.ts` tests, plus 5 new `study.store.spec.ts` tests: 154 − 6 + 8 + 5 = 161).

- [ ] **Step 16: Commit**

```bash
git add src/app/core/srs/level.ts src/app/core/srs/level.spec.ts \
  src/app/core/models/review-state.model.ts \
  src/app/core/srs/srs.service.ts src/app/core/srs/srs.service.spec.ts \
  src/app/features/study/study.store.ts src/app/features/study/study.store.spec.ts \
  src/app/features/study/study.html
git commit -m "feat(srs): replace SM-2 with a level engine (0-5), record study sessions"
```

---

### Task 3: Dexie migration — reset `reviewStates` when upgrading to the level schema

**Files:**
- Modify: `src/app/core/persistence/db.service.ts`
- Create: `src/app/core/persistence/db.service.migration.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 2 at the type level — `StoredReviewState extends ReviewState` is shape-agnostic, so this task doesn't strictly need Task 2 to compile. It's ordered after Task 2 here only because the migration makes more sense once the new model exists.
- Produces: `DbService` version 3, with `reviewStates` cleared on upgrade from version 2

- [ ] **Step 1: Write the migration test against an isolated database name**

Don't point this test at the app's real `'flash-shields'` database name. The whole suite runs in one shared `fake-indexeddb` global, and every other spec file's `beforeEach` keeps a `TestBed`-injected `DbService` connection to `'flash-shields'` open for the entire run; a raw `Dexie('flash-shields')` handle deleting/closing that name mid-suite risks tripping other files' pending operations. (Verified: opening/closing a second raw connection under a name of its own alongside the full suite — `npx ng test --watch=false` — produces no new failures beyond the pre-existing, harmless `DatabaseClosedError` unhandled-rejection noise the suite already has today with zero changes applied.)

Create `src/app/core/persistence/db.service.migration.spec.ts`:

```typescript
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

// Mirrors DbService's version chain under a database name of its own, so this
// test can freely open/close/delete without disturbing the shared
// 'flash-shields' instance other spec files keep open for the whole run.
// Keep this in sync with db.service.ts's version(1)/(2)/(3) definitions.
const DB_NAME = 'flash-shields-migration-test';

function openLegacyShapedDb(): Dexie {
  const db = new Dexie(DB_NAME);
  db.version(1).stores({
    leagues: 'id',
    teams: 'id, *leagueIds',
    decks: 'id',
    reviewStates: 'id, deckId, dueDate',
    badgeBlobs: 'key',
  });
  db.version(2).stores({ sessions: 'id, deckId, mode, startedAt' });
  return db;
}

function openUpgradedDb(): Dexie {
  const db = openLegacyShapedDb();
  db.version(3)
    .stores({ reviewStates: 'id, deckId, dueDate' })
    .upgrade(tx => tx.table('reviewStates').clear());
  return db;
}

describe('Dexie migration to v3 (mirrors DbService)', () => {
  afterEach(async () => {
    await Dexie.delete(DB_NAME);
  });

  it('clears reviewStates left over from the SM-2 schema when upgrading to the level-based schema', async () => {
    const legacy = openLegacyShapedDb();
    await legacy.open();
    await legacy.table('reviewStates').put({
      id: 'deck-1:ts-1',
      teamId: 'ts-1',
      deckId: 'deck-1',
      repetitions: 2,
      easeFactor: 2.5,
      intervalDays: 6,
      dueDate: '2026-01-01',
      lapses: 0,
      suspended: false,
    });
    legacy.close();

    const upgraded = openUpgradedDb();
    await upgraded.open();

    const remaining = await upgraded.table('reviewStates').toArray();
    expect(remaining).toHaveLength(0);
    upgraded.close();
  });
});
```

- [ ] **Step 2: Run the test to confirm it passes on its own**

This test mirrors the schema chain inline rather than importing `DbService` (see the note in Step 1), so there's no red phase against production code — it pins down the migration behavior in isolation first.

Run: `npx ng test --watch=false --include=src/app/core/persistence/db.service.migration.spec.ts`
Expected: PASS — 1 test passed.

- [ ] **Step 3: Add the matching version 3 upgrade to `DbService`**

In `src/app/core/persistence/db.service.ts`, update the constructor (around line 27-39):

```typescript
  constructor() {
    super('flash-shields');
    this.version(1).stores({
      leagues: 'id',
      teams: 'id, *leagueIds',
      decks: 'id',
      reviewStates: 'id, deckId, dueDate',
      badgeBlobs: 'key',
    });
    this.version(2).stores({
      sessions: 'id, deckId, mode, startedAt',
    });
    // Bumping the version number alone would NOT clear old rows — Dexie only
    // recreates indexes when the schema string changes, and this one hasn't.
    // The explicit .upgrade() is what actually discards the SM-2-shaped rows
    // (repetitions/easeFactor/intervalDays) that don't carry the new `level`
    // field, which would otherwise crash the app at runtime.
    this.version(3).stores({
      reviewStates: 'id, deckId, dueDate',
    }).upgrade(tx => tx.table('reviewStates').clear());
  }
```

- [ ] **Step 4: Run the existing `db.service.spec.ts` to confirm no regression**

Run: `npx ng test --watch=false --include=src/app/core/persistence/db.service.spec.ts`
Expected: PASS — 4 tests passed (unaffected by the version bump, since they only clear/put/get on `teams`/`sessions`, not `reviewStates`).

- [ ] **Step 5: Run the whole suite**

Run: `npx ng test --watch=false`
Expected: PASS — 33 test files, 162 tests (161 from Task 2's checkpoint plus this task's 1 new migration test).

- [ ] **Step 6: Commit**

```bash
git add src/app/core/persistence/db.service.ts src/app/core/persistence/db.service.migration.spec.ts
git commit -m "feat(db): reset reviewStates on upgrade to the level-based schema (v3)"
```

---

### Task 4: Estatísticas — histórico de sessões de estudo e heatmap de revisões

**Files:**
- Modify: `src/app/features/stats/stats.store.ts`
- Modify: `src/app/features/stats/stats.store.spec.ts`
- Modify: `src/app/features/stats/stats.ts`
- Modify: `src/app/features/stats/stats.html`
- Modify: `src/app/features/stats/stats.scss`
- Modify: `src/app/features/stats/stats.spec.ts`

**Interfaces:**
- Consumes: `Session { mode: GameMode; answers: SessionAnswer[]; startedAt: string }` (existing, `GameMode` now includes `'study'` from Task 1), real `mode: 'study'` sessions now flowing in from Task 2's `StudyStore`
- Produces: `StatsStore.studySessions: Signal<StudySessionSummary[]>`, `StatsStore.reviewHeatmap: Signal<ReviewHeatmapDay[]>`

- [ ] **Step 1: Write the failing tests for the new aggregates**

Append to `src/app/features/stats/stats.store.spec.ts`, inside the existing `describe('StatsStore', ...)` block, right before its closing `});`:

```typescript
  it('summarizes past study sessions with date, card count, and accuracy, newest first', async () => {
    await db.sessions.bulkPut([
      makeSession({
        id: 's1',
        mode: 'study',
        startedAt: '2026-07-18T10:00:00.000Z',
        answers: [answer(true), answer(false)],
      }),
      makeSession({
        id: 's2',
        mode: 'study',
        startedAt: '2026-07-20T10:00:00.000Z',
        answers: [answer(true)],
      }),
    ]);

    await store.load();

    expect(store.studySessions()).toEqual([
      { id: 's2', startedAt: '2026-07-20T10:00:00.000Z', cardCount: 1, accuracy: 1 },
      { id: 's1', startedAt: '2026-07-18T10:00:00.000Z', cardCount: 2, accuracy: 0.5 },
    ]);
  });

  it('excludes non-study sessions from the study session history', async () => {
    await db.sessions.put(makeSession({ mode: 'multiple-choice', answers: [answer(true)] }));

    await store.load();

    expect(store.studySessions()).toEqual([]);
  });

  it('builds a 90-day review heatmap counting only study-session answers per day', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await db.sessions.bulkPut([
      makeSession({
        mode: 'study',
        answers: [
          { teamId: 't1', correct: true, responseMs: 1000, answeredAt: `${today}T09:00:00.000Z` },
          { teamId: 't2', correct: true, responseMs: 1000, answeredAt: `${today}T09:05:00.000Z` },
        ],
      }),
      makeSession({
        mode: 'multiple-choice',
        answers: [{ teamId: 't3', correct: true, responseMs: 1000, answeredAt: `${today}T09:10:00.000Z` }],
      }),
    ]);

    await store.load();

    const heatmap = store.reviewHeatmap();
    expect(heatmap).toHaveLength(90);
    expect(heatmap[heatmap.length - 1]).toEqual({ date: today, count: 2 });
    expect(heatmap[0].date < today).toBe(true);
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx ng test --watch=false --include=src/app/features/stats/stats.store.spec.ts`
Expected: FAIL — `store.studySessions` and `store.reviewHeatmap` are not functions yet.

- [ ] **Step 3: Add the new aggregates to `StatsStore`**

In `src/app/features/stats/stats.store.ts`, add these two interfaces after the existing `ModeStreak` interface (currently ending at line 17):

```typescript
export interface StudySessionSummary {
  id: string;
  startedAt: string;
  cardCount: number;
  accuracy: number;
}

export interface ReviewHeatmapDay {
  date: string;
  count: number;
}
```

Add two new signals to the `StatsStore` class, alongside the existing ones (currently lines 23-26):

```typescript
  readonly studySessions = signal<StudySessionSummary[]>([]);
  readonly reviewHeatmap = signal<ReviewHeatmapDay[]>([]);
```

Update `load()` (currently lines 28-35) to compute them:

```typescript
  async load() {
    const sessions = await this.db.sessions.toArray();

    this.totalSessions.set(sessions.length);
    this.overallAccuracy.set(computeAccuracy(sessions.flatMap(session => session.answers)));
    this.accuracyByDeck.set(await this.computeAccuracyByDeck(sessions));
    this.bestStreakByMode.set(computeBestStreakByMode(sessions));

    const studySessions = sessions.filter(session => session.mode === 'study');
    this.studySessions.set(computeStudySessionSummaries(studySessions));
    this.reviewHeatmap.set(computeReviewHeatmap(studySessions));
  }
```

Add these two module-level helpers at the end of the file, after the existing `longestCorrectStreak` function:

```typescript
const HEATMAP_DAYS = 90;

function computeStudySessionSummaries(sessions: Session[]): StudySessionSummary[] {
  return sessions
    .map(session => ({
      id: session.id,
      startedAt: session.startedAt,
      cardCount: session.answers.length,
      accuracy: computeAccuracy(session.answers),
    }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function computeReviewHeatmap(sessions: Session[]): ReviewHeatmapDay[] {
  const countsByDate = new Map<string, number>();
  for (const session of sessions) {
    for (const answer of session.answers) {
      const date = answer.answeredAt.slice(0, 10);
      countsByDate.set(date, (countsByDate.get(date) ?? 0) + 1);
    }
  }

  // Anchored on the same UTC-midnight representation `answeredAt.slice(0, 10)`
  // implies, so the "today" bucket lines up with real answers instead of
  // drifting by a day near local-timezone midnight.
  const todayUtc = new Date(new Date().toISOString().slice(0, 10));
  const days: ReviewHeatmapDay[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const date = new Date(todayUtc);
    date.setUTCDate(date.getUTCDate() - i);
    const key = date.toISOString().slice(0, 10);
    days.push({ date: key, count: countsByDate.get(key) ?? 0 });
  }
  return days;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx ng test --watch=false --include=src/app/features/stats/stats.store.spec.ts`
Expected: PASS — 10 tests passed (7 existing + 3 new).

- [ ] **Step 5: Write the failing UI tests**

Append to `src/app/features/stats/stats.spec.ts`, inside the existing `describe('Stats', ...)` block, right before its closing `});`:

```typescript
  it('shows Estudo as the mode label for study sessions in best streak', async () => {
    const session: Session = {
      id: 'sess-1',
      deckId: 'deck-1',
      mode: 'study',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      answers: [{ teamId: 't1', correct: true, responseMs: 1000, answeredAt: new Date().toISOString() }],
      score: 1,
    };
    await db.sessions.put(session);

    fixture = TestBed.createComponent(Stats);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const modeRow = fixture.nativeElement.querySelector('[data-testid="mode-streak"]');
    expect(modeRow.textContent).toContain('Estudo');
  });

  it('lists past study sessions with date, card count and accuracy', async () => {
    const startedAt = new Date('2026-07-20T10:00:00Z').toISOString();
    const session: Session = {
      id: 'sess-study-1',
      deckId: 'deck-1',
      mode: 'study',
      startedAt,
      endedAt: new Date('2026-07-20T10:05:00Z').toISOString(),
      answers: [
        { teamId: 't1', correct: true, responseMs: 1000, answeredAt: startedAt },
        { teamId: 't2', correct: false, responseMs: 1000, answeredAt: startedAt },
      ],
      score: 1,
    };
    await db.sessions.put(session);

    fixture = TestBed.createComponent(Stats);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-testid="study-session"]');
    expect(row.textContent).toContain('2 cards');
    expect(row.textContent).toContain('50%');
  });

  it('shows a message instead of the study history when no study session exists yet', async () => {
    const session: Session = {
      id: 'sess-1',
      deckId: 'deck-1',
      mode: 'multiple-choice',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      answers: [{ teamId: 't1', correct: true, responseMs: 1000, answeredAt: new Date().toISOString() }],
      score: 1,
    };
    await db.sessions.put(session);

    fixture = TestBed.createComponent(Stats);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nenhuma sessão de estudo registrada ainda');
    expect(fixture.nativeElement.querySelector('[data-testid="review-heatmap"]')).toBeFalsy();
  });

  it('renders a heatmap cell for every day once a study session exists', async () => {
    const session: Session = {
      id: 'sess-study-1',
      deckId: 'deck-1',
      mode: 'study',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      answers: [{ teamId: 't1', correct: true, responseMs: 1000, answeredAt: new Date().toISOString() }],
      score: 1,
    };
    await db.sessions.put(session);

    fixture = TestBed.createComponent(Stats);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const heatmap = fixture.nativeElement.querySelector('[data-testid="review-heatmap"]');
    expect(heatmap.querySelectorAll('.heatmap__cell').length).toBe(90);
  });
```

- [ ] **Step 6: Run the test to confirm it fails**

Run: `npx ng test --watch=false --include=src/app/features/stats/stats.spec.ts`
Expected: FAIL — no element matches `[data-testid="study-session"]` or `[data-testid="review-heatmap"]`, and the "Nenhuma sessão de estudo" text isn't rendered anywhere yet.

- [ ] **Step 7: Add `formatDate` and `heatmapLevel` to the `Stats` component**

In `src/app/features/stats/stats.ts`, add these two methods after `formatPercent` (currently lines 36-38):

```typescript
  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  heatmapLevel(count: number): number {
    if (count === 0) return 0;
    if (count < 5) return 1;
    if (count < 10) return 2;
    if (count < 20) return 3;
    return 4;
  }
```

- [ ] **Step 8: Add the study history and heatmap sections to `stats.html`**

In `src/app/features/stats/stats.html`, insert a new section right after the "Melhor sequência" section (after the closing `</section>` that currently ends the file at line 62), before the final `}` that closes the outer `@else`:

```html
    <section aria-label="Estudo">
      <p class="eyebrow">Estudo</p>
      @if (store.studySessions().length === 0) {
        <p class="study-history-empty">Nenhuma sessão de estudo registrada ainda.</p>
      } @else {
        <div class="deck-accuracy-list">
          @for (session of store.studySessions(); track session.id) {
            <div class="card deck-accuracy-row" data-testid="study-session">
              <span class="deck-accuracy-row__name">
                {{ formatDate(session.startedAt) }} · {{ session.cardCount }} cards
              </span>
              <span class="deck-accuracy-row__value">{{ formatPercent(session.accuracy) }}</span>
            </div>
          }
        </div>

        <div class="heatmap" data-testid="review-heatmap">
          @for (day of store.reviewHeatmap(); track day.date) {
            <span
              class="heatmap__cell"
              [attr.data-level]="heatmapLevel(day.count)"
              [title]="day.date + ': ' + day.count + ' revisões'"
            ></span>
          }
        </div>
      }
    </section>
```

The full `@else` block in `stats.html` (originally lines 20-62) now reads:

```html
  } @else {
    <div class="stat-row">
      <div class="stat-chip">
        <span class="stat-chip__value">{{ store.totalSessions() }}</span>
        <span class="stat-chip__label">Partidas</span>
      </div>
      <div class="stat-chip">
        <span class="stat-chip__value">{{ formatPercent(store.overallAccuracy()) }}</span>
        <span class="stat-chip__label">Precisão geral</span>
      </div>
    </div>

    <section aria-label="Precisão por deck">
      <p class="eyebrow">Por deck</p>
      <div class="deck-accuracy-list">
        @for (deck of store.accuracyByDeck(); track deck.deckId) {
          <div class="card deck-accuracy-row" data-testid="deck-accuracy">
            <span class="deck-accuracy-row__label">
              @if (deck.league; as league) {
                <span class="deck-accuracy-row__badge">
                  <app-league-badge [league]="league" />
                </span>
              }
              <span class="deck-accuracy-row__name">{{ deck.deckName }}</span>
            </span>
            <span class="deck-accuracy-row__value">{{ formatPercent(deck.accuracy) }}</span>
          </div>
        }
      </div>
    </section>

    <section aria-label="Melhor sequência por modo">
      <p class="eyebrow">Melhor sequência</p>
      <div class="deck-accuracy-list">
        @for (entry of store.bestStreakByMode(); track entry.mode) {
          <div class="card deck-accuracy-row" data-testid="mode-streak">
            <span class="deck-accuracy-row__name">{{ modeLabel(entry.mode) }}</span>
            <span class="deck-accuracy-row__value">{{ entry.bestStreak }}</span>
          </div>
        }
      </div>
    </section>

    <section aria-label="Estudo">
      <p class="eyebrow">Estudo</p>
      @if (store.studySessions().length === 0) {
        <p class="study-history-empty">Nenhuma sessão de estudo registrada ainda.</p>
      } @else {
        <div class="deck-accuracy-list">
          @for (session of store.studySessions(); track session.id) {
            <div class="card deck-accuracy-row" data-testid="study-session">
              <span class="deck-accuracy-row__name">
                {{ formatDate(session.startedAt) }} · {{ session.cardCount }} cards
              </span>
              <span class="deck-accuracy-row__value">{{ formatPercent(session.accuracy) }}</span>
            </div>
          }
        </div>

        <div class="heatmap" data-testid="review-heatmap">
          @for (day of store.reviewHeatmap(); track day.date) {
            <span
              class="heatmap__cell"
              [attr.data-level]="heatmapLevel(day.count)"
              [title]="day.date + ': ' + day.count + ' revisões'"
            ></span>
          }
        </div>
      }
    </section>
  }
```

- [ ] **Step 9: Add heatmap and study-history styles to `stats.scss`**

Append to `src/app/features/stats/stats.scss`:

```scss
.study-history-empty {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 1.5rem;
}

.heatmap {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  gap: 0.2rem;
  margin-top: 0.75rem;
}

.heatmap__cell {
  aspect-ratio: 1;
  border-radius: 2px;
  background: var(--surface-raised);

  &[data-level='1'] {
    background: color-mix(in srgb, var(--accent) 25%, var(--surface-raised));
  }

  &[data-level='2'] {
    background: color-mix(in srgb, var(--accent) 50%, var(--surface-raised));
  }

  &[data-level='3'] {
    background: color-mix(in srgb, var(--accent) 75%, var(--surface-raised));
  }

  &[data-level='4'] {
    background: var(--accent);
  }
}
```

- [ ] **Step 10: Run the test to confirm it passes**

Run: `npx ng test --watch=false --include=src/app/features/stats/stats.spec.ts`
Expected: PASS — 8 tests passed (4 existing + 4 new).

- [ ] **Step 11: Run the full test suite**

Run: `npx ng test --watch=false`
Expected: PASS — 33 test files, 169 tests (162 from Task 3's checkpoint, plus this task's 3 `stats.store.spec.ts` tests and 4 `stats.spec.ts` tests: 162 + 3 + 4 = 169). This is the final state of the whole plan.

- [ ] **Step 12: Commit**

```bash
git add src/app/features/stats/stats.store.ts src/app/features/stats/stats.store.spec.ts \
  src/app/features/stats/stats.ts src/app/features/stats/stats.html src/app/features/stats/stats.scss \
  src/app/features/stats/stats.spec.ts
git commit -m "feat(stats): add study session history and a review heatmap"
```

---

## Self-Review Notes

**Spec coverage:**
- Motor de nível de domínio (0-5), transições por resposta, clamp 0-5 → Task 2.
- Reset dos dados antigos (sem migração) → Task 3, with a real upgrade-path test rather than a manual-check placeholder.
- Reinserção em relearning na mesma sessão → Task 2.
- Gravação de `Session`/`SessionAnswer` no modo Estudo → Task 2.
- Histórico de sessões de estudo → Task 4.
- Heatmap de revisões (só modo estudo) → Task 4.
- Botões da UI mantêm os rótulos atuais → Task 2, Step 14 keeps "Errei/Difícil/Bom/Fácil" text unchanged, only the bound value changes.

**Placeholder scan:** No TBD/TODO; the one place a plan might be tempted to write "add a migration test later" (Task 3) instead has a real, verified-working test.

**Type consistency:** `ReviewGrade` (Task 2) flows unchanged through `SrsService.grade` → `StudyStore.grade` → `study.html` bindings, all within Task 2. `GameMode`'s `'study'` member (Task 1) is consumed identically in `stats.ts`'s `modeLabel` (Task 1), `StudyStore.finishSession` (Task 2), and `stats.store.ts`'s `session.mode === 'study'` filter (Task 4) — no naming drift.

**Task-boundary verification:** every checkpoint above (after Tasks 1, 2, 3, and 4) was actually applied to the repo and run through `npx ng test --watch=false` end-to-end during planning, confirming 154 → 161 → 162 → 169 passing tests in sequence with no compile errors at any boundary. The working tree was reverted to a clean state afterward — none of this plan's changes are in the repo yet.
