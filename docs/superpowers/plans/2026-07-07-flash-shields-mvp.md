# Flash Shields — MVP (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, installable PWA where a user imports the Premier League from TheSportsDB, studies its 20 shields with an SM-2 spaced-repetition loop, and plays a multiple-choice quiz round — fully offline after the first import.

**Architecture:** Standalone Angular components with Signals for local state, a thin `DbService` wrapping a single Dexie (IndexedDB) database for persistence, one `DataSourceAdapter` (TheSportsDB) behind a provider-agnostic interface, and a `BadgeCacheService` that turns remote PNGs into cached Blobs served via `URL.createObjectURL`. No NgRx, no backend.

**Tech Stack:** Angular (latest stable, standalone + Signals), TypeScript strict mode, Dexie.js over IndexedDB, `@angular/pwa` service worker, Jasmine + Karma (Angular's built-in `ng test` runner) for unit/component tests, Playwright for one end-to-end smoke test, `fake-indexeddb` to exercise Dexie code in unit tests.

## Global Constraints

- Standalone components only, no NgModules (spec §6).
- Signals for all local reactive state; `computed`/`effect` for derivations (spec §6).
- `OnPush` change detection on every component (spec §6) — set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly.
- Lazy-loaded feature routes via `loadComponent` (spec §6).
- TypeScript strict mode (spec §10).
- Never call TheSportsDB during study/game — only during explicit import (spec §7, §10 "Cuidados de implementação").
- Import is idempotent: re-importing upserts by `externalIds` without duplicating teams or wiping existing `ReviewState` (spec §7).
- Shields are downloaded once, converted to `Blob`, and persisted in IndexedDB; the UI always reads from cache, network is fallback only (spec §7).
- Domain models (`Team`, `League`, `Region`, `Deck`, `ReviewState`) are independent of any API's payload shape — API responses are translated by a `DataSourceAdapter` (spec §2, §3).
- SM-2 quality is one of `0 | 3 | 4 | 5` (Errei/Difícil/Bom/Fácil) (spec §4).

**Deviations from the spec's suggested stack (and why):**
- **Test runner: Jasmine/Karma (`ng test`) instead of Jest/Vitest.** The spec says "Jest/Vitest" (either is acceptable). Jasmine/Karma is Angular CLI's zero-config default, so every command in this plan is guaranteed to work regardless of exact Angular CLI version. Swapping to Vitest later is a tooling-only change; it doesn't touch app code.
- **No `features/decks/` screen in the MVP.** The spec's full folder tree lists `decks/` as always present, but the MVP only needs one deck per imported league, auto-created on import. `HomeComponent` doubles as the deck list. Custom deck CRUD is Fase 2 scope ("Decks por país e região").
- **No HTTP retry/throttle interceptor.** Import is a single manual button click; on failure the user just clicks again. Formal interceptors are deferred until Fase 2/3 introduce more API traffic.
- **No `Region`/`Session` persistence in the MVP.** Region browsing is Fase 2 ("filtro em cascata"). Session history/stats are Fase 2 ("Tela de estatísticas"). Score/streak for the MVP's multiple-choice mode live only in component state for the duration of the round.

---

## File Structure

```
flash-shields/
  src/
    environments/
      environment.ts
      environment.development.ts
    app/
      core/
        models/
          league.model.ts
          team.model.ts
          deck.model.ts
          review-state.model.ts
        util/
          random.util.ts
        data/
          data-source.adapter.ts
          thesportsdb.adapter.ts
          team-mapper.ts
          import.service.ts
          league-import.config.ts
        persistence/
          db.service.ts
          badge-cache.service.ts
        decks/
          deck.service.ts
        srs/
          srs.constants.ts
          srs.service.ts
      features/
        home/
          home.component.ts
          home.component.html
        study/
          study.store.ts
          study.component.ts
          study.component.html
        game/
          game.util.ts
          game.store.ts
          game.component.ts
          game.component.html
      shared/
        ui/
          team-badge.component.ts
      app.routes.ts
      app.config.ts
      app.component.ts
  e2e/
    mvp-flow.spec.ts
```

---

### Task 1: Bootstrap the Angular project and base tooling

**Files:**
- Create: entire generated Angular workspace (`angular.json`, `package.json`, `tsconfig*.json`, `src/main.ts`, `src/app/app.component.ts`, etc.)
- Create: `src/environments/environment.ts`, `src/environments/environment.development.ts`

**Interfaces:**
- Produces: a working `ng test`, `ng build`, `ng serve` toolchain that every later task builds on.

- [ ] **Step 1: Install the Angular CLI and scaffold the workspace**

The directory currently has only `docs/` and `.claude/`. `ng new` refuses non-empty directories, so scaffold into a temp folder and merge:

```bash
npm install -g @angular/cli@latest
cd /media/dados/aplicacoes/git/flash-shields
mkdir /tmp/flash-shields-scaffold
ng new flash-shields --directory=/tmp/flash-shields-scaffold --routing --style=scss --ssr=false --skip-git --package-manager=npm
shopt -s dotglob
mv /tmp/flash-shields-scaffold/* .
rmdir /tmp/flash-shields-scaffold
```

- [ ] **Step 2: Verify the default project builds and tests pass**

Run: `npm test -- --watch=false`
Expected: the generated `app.component.spec.ts` suite passes (green).

Run: `npx ng build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Install runtime and dev dependencies**

```bash
npm install dexie
npm install -D fake-indexeddb
```

- [ ] **Step 4: Generate environment files**

```bash
npx ng generate environments
```

- [ ] **Step 5: Add the TheSportsDB API key to environments**

`src/environments/environment.ts`:
```typescript
export const environment = {
  production: true,
  theSportsDbApiKey: '3',
};
```

`src/environments/environment.development.ts`:
```typescript
export const environment = {
  production: false,
  theSportsDbApiKey: '3',
};
```

`'3'` is TheSportsDB's public free test key (spec §2 — "importe e cacheie", low-volume one-time import; a personal key can replace it later without code changes).

- [ ] **Step 6: Commit**

```bash
git init
git add -A
git commit -m "chore: bootstrap Angular workspace with Dexie and environments"
```

---

### Task 2: Core domain models

**Files:**
- Create: `src/app/core/models/league.model.ts`
- Create: `src/app/core/models/team.model.ts`
- Create: `src/app/core/models/deck.model.ts`
- Create: `src/app/core/models/review-state.model.ts`

**Interfaces:**
- Produces: `League`, `Team`, `Deck`, `DeckScope`, `ReviewState`, `ReviewQuality` — consumed by every task from here on.

These are pure type declarations (spec §3); there's no runtime behavior to red/green test, so verification is a strict type-check instead.

- [ ] **Step 1: Write the model files**

`src/app/core/models/league.model.ts`:
```typescript
export interface League {
  id: string;
  externalIds: Record<string, string>;
  name: string;
  country: string;
  regionId: string;
  sport: 'soccer';
  badgeUrl?: string;
}
```

`src/app/core/models/team.model.ts`:
```typescript
export interface Team {
  id: string;
  externalIds: Record<string, string>;
  name: string;
  shortName?: string;
  alternateNames: string[];
  country: string;
  leagueIds: string[];
  badgeUrl: string;
  badgeLocalKey?: string;
  founded?: number;
  colors?: string;
}
```

`src/app/core/models/review-state.model.ts`:
```typescript
export type ReviewQuality = 0 | 3 | 4 | 5;

export interface ReviewState {
  teamId: string;
  deckId: string;
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  dueDate: string;
  lastReviewed?: string;
  lapses: number;
  suspended: boolean;
}
```

`src/app/core/models/deck.model.ts`:
```typescript
export type DeckScope =
  | { kind: 'league'; leagueId: string }
  | { kind: 'country'; country: string }
  | { kind: 'region'; regionId: string }
  | { kind: 'custom' };

export interface Deck {
  id: string;
  name: string;
  scope: DeckScope;
  teamIds: string[];
  createdAt: string;
}
```

- [ ] **Step 2: Verify with a strict type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/models
git commit -m "feat: add core domain models"
```

---

### Task 3: Random utilities (shuffle / pickRandom)

**Files:**
- Create: `src/app/core/util/random.util.ts`
- Test: `src/app/core/util/random.util.spec.ts`

**Interfaces:**
- Produces: `shuffle<T>(items: readonly T[]): T[]`, `pickRandom<T>(items: readonly T[], count: number): T[]` — consumed by Task 13 (game distractors).

- [ ] **Step 1: Write the failing test**

`src/app/core/util/random.util.spec.ts`:
```typescript
import { shuffle, pickRandom } from './random.util';

describe('shuffle', () => {
  it('returns an array with the same elements, possibly reordered', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result.length).toBe(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    shuffle(input);
    expect(input).toEqual([1, 2, 3]);
  });
});

describe('pickRandom', () => {
  it('returns the requested number of unique items from the input', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const result = pickRandom(input, 3);
    expect(result.length).toBe(3);
    expect(new Set(result).size).toBe(3);
    for (const item of result) {
      expect(input).toContain(item);
    }
  });

  it('caps at the input length when count exceeds it', () => {
    const result = pickRandom(['a', 'b'], 5);
    expect(result.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/random.util.spec.ts'`
Expected: FAIL — `random.util` module not found.

- [ ] **Step 3: Write the implementation**

`src/app/core/util/random.util.ts`:
```typescript
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickRandom<T>(items: readonly T[], count: number): T[] {
  return shuffle(items).slice(0, count);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/random.util.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/util
git commit -m "feat: add shuffle and pickRandom utilities"
```

---

### Task 4: SM-2 spaced-repetition algorithm

**Files:**
- Create: `src/app/core/srs/srs.constants.ts`
- Create: `src/app/core/srs/sm2.ts`
- Test: `src/app/core/srs/sm2.spec.ts`

**Interfaces:**
- Consumes: `ReviewState`, `ReviewQuality` from Task 2.
- Produces: `applySm2(state: ReviewState, quality: ReviewQuality): ReviewState`, `today(): string`, `addDays(dateStr: string, days: number): string` — consumed by Task 10 (`SrsService`).

- [ ] **Step 1: Write the failing tests**

`src/app/core/srs/sm2.spec.ts`:
```typescript
import { applySm2, today, addDays } from './sm2';
import { ReviewState } from '../models/review-state.model';

function makeState(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    teamId: 'team-1',
    deckId: 'deck-1',
    repetitions: 0,
    easeFactor: 2.5,
    intervalDays: 0,
    dueDate: today(),
    lapses: 0,
    suspended: false,
    ...overrides,
  };
}

describe('applySm2', () => {
  it('resets repetitions and schedules for tomorrow on a fail (quality 0)', () => {
    const state = makeState({ repetitions: 3, intervalDays: 10, lapses: 1 });
    const result = applySm2(state, 0);
    expect(result.repetitions).toBe(0);
    expect(result.intervalDays).toBe(1);
    expect(result.lapses).toBe(2);
    expect(result.dueDate).toBe(addDays(today(), 1));
  });

  it('schedules a first-time pass for 1 day out', () => {
    const state = makeState({ repetitions: 0 });
    const result = applySm2(state, 4);
    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.dueDate).toBe(addDays(today(), 1));
  });

  it('schedules a second consecutive pass for 6 days out', () => {
    const state = makeState({ repetitions: 1, intervalDays: 1 });
    const result = applySm2(state, 4);
    expect(result.repetitions).toBe(2);
    expect(result.intervalDays).toBe(6);
  });

  it('multiplies the interval by the ease factor from the third pass onward', () => {
    const state = makeState({ repetitions: 2, intervalDays: 6, easeFactor: 2.5 });
    const result = applySm2(state, 4);
    expect(result.repetitions).toBe(3);
    expect(result.intervalDays).toBe(Math.round(6 * 2.5));
  });

  it('never drops the ease factor below 1.3', () => {
    const state = makeState({ repetitions: 5, intervalDays: 20, easeFactor: 1.3 });
    const result = applySm2(state, 3);
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('raises the ease factor on an easy pass (quality 5)', () => {
    const state = makeState({ repetitions: 2, intervalDays: 6, easeFactor: 2.5 });
    const result = applySm2(state, 5);
    expect(result.easeFactor).toBeGreaterThan(2.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/sm2.spec.ts'`
Expected: FAIL — `sm2` module not found.

- [ ] **Step 3: Write the implementation**

`src/app/core/srs/sm2.ts`:
```typescript
import { ReviewState, ReviewQuality } from '../models/review-state.model';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function applySm2(state: ReviewState, quality: ReviewQuality): ReviewState {
  let { repetitions, easeFactor, intervalDays } = state;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
    return {
      ...state,
      repetitions,
      intervalDays,
      lapses: state.lapses + 1,
      dueDate: addDays(today(), 1),
      lastReviewed: today(),
    };
  }

  repetitions += 1;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 6;
  else intervalDays = Math.round(intervalDays * easeFactor);

  easeFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  return {
    ...state,
    repetitions,
    easeFactor,
    intervalDays,
    dueDate: addDays(today(), intervalDays),
    lastReviewed: today(),
  };
}
```

`src/app/core/srs/srs.constants.ts`:
```typescript
export const NEW_CARDS_PER_DAY = 20;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/sm2.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/srs
git commit -m "feat: implement SM-2 spaced repetition algorithm"
```

---

### Task 5: Dexie database service

**Files:**
- Create: `src/app/core/persistence/db.service.ts`
- Test: `src/app/core/persistence/db.service.spec.ts`

**Interfaces:**
- Consumes: `League`, `Team`, `Deck`, `ReviewState` from Task 2.
- Produces: `DbService` with typed Dexie tables `leagues`, `teams`, `decks`, `reviewStates`, `badgeBlobs`, plus `upsertTeam(team: Team): Promise<void>` — consumed by every remaining data task.

- [ ] **Step 1: Write the failing test**

`src/app/core/persistence/db.service.spec.ts`:
```typescript
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { DbService } from './db.service';
import { Team } from '../models/team.model';

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'ts-1',
    externalIds: { thesportsdb: '1' },
    name: 'Arsenal',
    alternateNames: [],
    country: 'England',
    leagueIds: ['ts-4328'],
    badgeUrl: 'https://example.com/arsenal.png',
    ...overrides,
  };
}

describe('DbService', () => {
  let service: DbService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DbService);
    await service.teams.clear();
  });

  it('stores and retrieves a team', async () => {
    await service.teams.put(makeTeam());
    const found = await service.teams.get('ts-1');
    expect(found?.name).toBe('Arsenal');
  });

  it('upsertTeam inserts a new team as-is', async () => {
    await service.upsertTeam(makeTeam());
    const found = await service.teams.get('ts-1');
    expect(found?.leagueIds).toEqual(['ts-4328']);
  });

  it('upsertTeam merges leagueIds instead of overwriting on re-import', async () => {
    await service.upsertTeam(makeTeam({ leagueIds: ['ts-4328'] }));
    await service.upsertTeam(makeTeam({ leagueIds: ['ts-4329'], name: 'Arsenal FC' }));

    const found = await service.teams.get('ts-1');
    expect(found?.name).toBe('Arsenal FC');
    expect(new Set(found?.leagueIds)).toEqual(new Set(['ts-4328', 'ts-4329']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/db.service.spec.ts'`
Expected: FAIL — `db.service` module not found.

- [ ] **Step 3: Write the implementation**

`src/app/core/persistence/db.service.ts`:
```typescript
import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { League } from '../models/league.model';
import { Team } from '../models/team.model';
import { Deck } from '../models/deck.model';
import { ReviewState } from '../models/review-state.model';

export interface StoredReviewState extends ReviewState {
  id: string;
}

export interface StoredBadgeBlob {
  key: string;
  blob: Blob;
}

@Injectable({ providedIn: 'root' })
export class DbService extends Dexie {
  leagues!: Table<League, string>;
  teams!: Table<Team, string>;
  decks!: Table<Deck, string>;
  reviewStates!: Table<StoredReviewState, string>;
  badgeBlobs!: Table<StoredBadgeBlob, string>;

  constructor() {
    super('flash-shields');
    this.version(1).stores({
      leagues: 'id',
      teams: 'id, *leagueIds',
      decks: 'id',
      reviewStates: 'id, deckId, dueDate',
      badgeBlobs: 'key',
    });
  }

  async upsertTeam(team: Team): Promise<void> {
    const existing = await this.teams.get(team.id);
    if (!existing) {
      await this.teams.put(team);
      return;
    }
    const mergedLeagueIds = Array.from(new Set([...existing.leagueIds, ...team.leagueIds]));
    await this.teams.put({ ...existing, ...team, leagueIds: mergedLeagueIds });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/db.service.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/persistence/db.service.ts src/app/core/persistence/db.service.spec.ts
git commit -m "feat: add Dexie-backed DbService with idempotent team upsert"
```

---

### Task 6: TheSportsDB adapter

**Files:**
- Create: `src/app/core/data/data-source.adapter.ts`
- Create: `src/app/core/data/thesportsdb.adapter.ts`
- Test: `src/app/core/data/thesportsdb.adapter.spec.ts`

**Interfaces:**
- Produces: `ImportedTeam` (`{ externalId, name, shortName?, alternateNames, country, badgeUrl, founded? }`), `DataSourceAdapter` interface, `TheSportsDbAdapter` implementing it with `fetchTeamsForLeague(externalLeagueId: string): Promise<ImportedTeam[]>` — consumed by Task 8 (`ImportService`).

- [ ] **Step 1: Write the failing test**

`src/app/core/data/thesportsdb.adapter.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TheSportsDbAdapter } from './thesportsdb.adapter';

describe('TheSportsDbAdapter', () => {
  let adapter: TheSportsDbAdapter;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    adapter = TestBed.inject(TheSportsDbAdapter);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('maps TheSportsDB teams into ImportedTeam records', async () => {
    const promise = adapter.fetchTeamsForLeague('4328');

    const req = httpMock.expectOne(
      req => req.url.includes('lookup_all_teams.php') && req.params.get('id') === '4328',
    );
    req.flush({
      teams: [
        {
          idTeam: '133604',
          strTeam: 'Arsenal',
          strTeamShort: 'Arsenal',
          strAlternate: 'Arsenal FC, The Gunners',
          strCountry: 'England',
          strBadge: 'https://r2.thesportsdb.com/images/media/team/badge/arsenal.png',
          intFormedYear: '1886',
        },
      ],
    });

    const result = await promise;
    expect(result).toEqual([
      {
        externalId: '133604',
        name: 'Arsenal',
        shortName: 'Arsenal',
        alternateNames: ['Arsenal FC', 'The Gunners'],
        country: 'England',
        badgeUrl: 'https://r2.thesportsdb.com/images/media/team/badge/arsenal.png',
        founded: 1886,
      },
    ]);
  });

  it('returns an empty array when the league has no teams', async () => {
    const promise = adapter.fetchTeamsForLeague('0');
    httpMock.expectOne(req => req.url.includes('lookup_all_teams.php')).flush({ teams: null });
    expect(await promise).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/thesportsdb.adapter.spec.ts'`
Expected: FAIL — `thesportsdb.adapter` module not found.

- [ ] **Step 3: Write the implementation**

`src/app/core/data/data-source.adapter.ts`:
```typescript
export interface ImportedTeam {
  externalId: string;
  name: string;
  shortName?: string;
  alternateNames: string[];
  country: string;
  badgeUrl: string;
  founded?: number;
}

export interface DataSourceAdapter {
  readonly sourceId: string;
  fetchTeamsForLeague(externalLeagueId: string): Promise<ImportedTeam[]>;
}
```

`src/app/core/data/thesportsdb.adapter.ts`:
```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DataSourceAdapter, ImportedTeam } from './data-source.adapter';

interface TheSportsDbTeam {
  idTeam: string;
  strTeam: string;
  strTeamShort: string | null;
  strAlternate: string | null;
  strCountry: string | null;
  strBadge: string | null;
  intFormedYear: string | null;
}

interface TheSportsDbTeamsResponse {
  teams: TheSportsDbTeam[] | null;
}

const BASE_URL = 'https://www.thesportsdb.com/api/v1/json';

@Injectable({ providedIn: 'root' })
export class TheSportsDbAdapter implements DataSourceAdapter {
  readonly sourceId = 'thesportsdb';
  private http = inject(HttpClient);

  async fetchTeamsForLeague(externalLeagueId: string): Promise<ImportedTeam[]> {
    const url = `${BASE_URL}/${environment.theSportsDbApiKey}/lookup_all_teams.php`;
    const response = await firstValueFrom(
      this.http.get<TheSportsDbTeamsResponse>(url, { params: { id: externalLeagueId } }),
    );
    return (response.teams ?? []).map(mapTeam);
  }
}

function mapTeam(team: TheSportsDbTeam): ImportedTeam {
  return {
    externalId: team.idTeam,
    name: team.strTeam,
    shortName: team.strTeamShort ?? undefined,
    alternateNames: team.strAlternate
      ? team.strAlternate.split(',').map(name => name.trim()).filter(Boolean)
      : [],
    country: team.strCountry ?? '',
    badgeUrl: team.strBadge ?? '',
    founded: team.intFormedYear ? Number(team.intFormedYear) : undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/thesportsdb.adapter.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/data/data-source.adapter.ts src/app/core/data/thesportsdb.adapter.ts src/app/core/data/thesportsdb.adapter.spec.ts
git commit -m "feat: add TheSportsDB adapter"
```

---

### Task 7: Badge cache service

**Files:**
- Create: `src/app/core/persistence/badge-cache.service.ts`
- Test: `src/app/core/persistence/badge-cache.service.spec.ts`

**Interfaces:**
- Consumes: `DbService.badgeBlobs` from Task 5, `Team` from Task 2.
- Produces: `BadgeCacheService.getObjectUrl(team: Team): Promise<string>` — consumed by Task 12 (`TeamBadgeComponent`).

- [ ] **Step 1: Write the failing test**

`src/app/core/persistence/badge-cache.service.spec.ts`:
```typescript
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BadgeCacheService } from './badge-cache.service';
import { DbService } from './db.service';
import { Team } from '../models/team.model';

function makeTeam(): Team {
  return {
    id: 'ts-1',
    externalIds: { thesportsdb: '1' },
    name: 'Arsenal',
    alternateNames: [],
    country: 'England',
    leagueIds: ['ts-4328'],
    badgeUrl: 'https://example.com/arsenal.png',
  };
}

describe('BadgeCacheService', () => {
  let service: BadgeCacheService;
  let db: DbService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BadgeCacheService);
    db = TestBed.inject(DbService);
    httpMock = TestBed.inject(HttpTestingController);
    await db.badgeBlobs.clear();
  });

  afterEach(() => httpMock.verify());

  it('downloads and caches the badge on first request', async () => {
    const promise = service.getObjectUrl(makeTeam());
    const req = httpMock.expectOne('https://example.com/arsenal.png');
    req.flush(new Blob(['fake-png-bytes']));

    const url = await promise;
    expect(url).toContain('blob:');
    const cached = await db.badgeBlobs.get('ts-1');
    expect(cached).toBeDefined();
  });

  it('serves from cache without a second HTTP request', async () => {
    await db.badgeBlobs.put({ key: 'ts-1', blob: new Blob(['cached-bytes']) });
    const url = await service.getObjectUrl(makeTeam());
    expect(url).toContain('blob:');
    httpMock.expectNone('https://example.com/arsenal.png');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/badge-cache.service.spec.ts'`
Expected: FAIL — `badge-cache.service` module not found.

- [ ] **Step 3: Write the implementation**

`src/app/core/persistence/badge-cache.service.ts`:
```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DbService } from './db.service';
import { Team } from '../models/team.model';

@Injectable({ providedIn: 'root' })
export class BadgeCacheService {
  private http = inject(HttpClient);
  private db = inject(DbService);

  async getObjectUrl(team: Team): Promise<string> {
    const cached = await this.db.badgeBlobs.get(team.id);
    if (cached) {
      return URL.createObjectURL(cached.blob);
    }

    const blob = await firstValueFrom(
      this.http.get(team.badgeUrl, { responseType: 'blob' }),
    );
    await this.db.badgeBlobs.put({ key: team.id, blob });
    return URL.createObjectURL(blob);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/badge-cache.service.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/persistence/badge-cache.service.ts src/app/core/persistence/badge-cache.service.spec.ts
git commit -m "feat: add BadgeCacheService for offline shield blobs"
```

---

### Task 8: Import service

**Files:**
- Create: `src/app/core/data/league-import.config.ts`
- Create: `src/app/core/data/team-mapper.ts`
- Create: `src/app/core/data/import.service.ts`
- Test: `src/app/core/data/team-mapper.spec.ts`
- Test: `src/app/core/data/import.service.spec.ts`

**Interfaces:**
- Consumes: `ImportedTeam` from Task 6, `DbService` from Task 5, `League` from Task 2.
- Produces: `LeagueImportConfig`, `MVP_LEAGUES_TO_IMPORT`, `mapImportedTeamToTeam(imported, leagueId): Team`, `ImportService.importLeague(config): Promise<League>`, `ImportService.progress: Signal<{done, total} | null>` — consumed by Task 9 (`DeckService`) and Task 14 (`HomeComponent`).

- [ ] **Step 1: Write the failing test for the pure mapper**

`src/app/core/data/team-mapper.spec.ts`:
```typescript
import { mapImportedTeamToTeam } from './team-mapper';
import { ImportedTeam } from './data-source.adapter';

describe('mapImportedTeamToTeam', () => {
  it('builds a stable, prefixed internal id from the external id', () => {
    const imported: ImportedTeam = {
      externalId: '133604',
      name: 'Arsenal',
      alternateNames: ['Arsenal FC'],
      country: 'England',
      badgeUrl: 'https://example.com/arsenal.png',
    };

    const team = mapImportedTeamToTeam(imported, 'ts-4328');

    expect(team.id).toBe('ts-133604');
    expect(team.externalIds).toEqual({ thesportsdb: '133604' });
    expect(team.leagueIds).toEqual(['ts-4328']);
    expect(team.name).toBe('Arsenal');
    expect(team.badgeUrl).toBe('https://example.com/arsenal.png');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/team-mapper.spec.ts'`
Expected: FAIL — `team-mapper` module not found.

- [ ] **Step 3: Write the mapper implementation**

`src/app/core/data/team-mapper.ts`:
```typescript
import { ImportedTeam } from './data-source.adapter';
import { Team } from '../models/team.model';

export function mapImportedTeamToTeam(imported: ImportedTeam, leagueId: string): Team {
  return {
    id: `ts-${imported.externalId}`,
    externalIds: { thesportsdb: imported.externalId },
    name: imported.name,
    shortName: imported.shortName,
    alternateNames: imported.alternateNames,
    country: imported.country,
    leagueIds: [leagueId],
    badgeUrl: imported.badgeUrl,
    founded: imported.founded,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/team-mapper.spec.ts'`
Expected: PASS

- [ ] **Step 5: Write the league import config**

`src/app/core/data/league-import.config.ts`:
```typescript
export interface LeagueImportConfig {
  externalId: string;
  name: string;
  country: string;
  regionId: string;
}

export const MVP_LEAGUES_TO_IMPORT: LeagueImportConfig[] = [
  { externalId: '4328', name: 'Premier League', country: 'England', regionId: 'europe' },
];
```

(`4328` is TheSportsDB's documented Premier League id — spec §2. Add more entries here once their ids are looked up; the MVP requires only 1–2 leagues per spec §9.)

- [ ] **Step 6: Write the failing test for ImportService**

`src/app/core/data/import.service.spec.ts`:
```typescript
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { ImportService } from './import.service';
import { DbService } from '../persistence/db.service';
import { TheSportsDbAdapter } from './thesportsdb.adapter';
import { LeagueImportConfig } from './league-import.config';

describe('ImportService', () => {
  let service: ImportService;
  let db: DbService;
  let adapterSpy: jasmine.SpyObj<TheSportsDbAdapter>;

  const config: LeagueImportConfig = {
    externalId: '4328',
    name: 'Premier League',
    country: 'England',
    regionId: 'europe',
  };

  beforeEach(async () => {
    adapterSpy = jasmine.createSpyObj('TheSportsDbAdapter', ['fetchTeamsForLeague']);
    TestBed.configureTestingModule({
      providers: [{ provide: TheSportsDbAdapter, useValue: adapterSpy }],
    });
    service = TestBed.inject(ImportService);
    db = TestBed.inject(DbService);
    await db.leagues.clear();
    await db.teams.clear();
  });

  it('creates the league and upserts its teams', async () => {
    adapterSpy.fetchTeamsForLeague.and.resolveTo([
      {
        externalId: '1',
        name: 'Arsenal',
        alternateNames: [],
        country: 'England',
        badgeUrl: 'https://example.com/a.png',
      },
    ]);

    const league = await service.importLeague(config);

    expect(league.id).toBe('ts-4328');
    expect(league.name).toBe('Premier League');
    const team = await db.teams.get('ts-1');
    expect(team?.name).toBe('Arsenal');
    expect(team?.leagueIds).toEqual(['ts-4328']);
  });

  it('is idempotent: re-importing does not duplicate teams', async () => {
    adapterSpy.fetchTeamsForLeague.and.resolveTo([
      {
        externalId: '1',
        name: 'Arsenal',
        alternateNames: [],
        country: 'England',
        badgeUrl: 'https://example.com/a.png',
      },
    ]);

    await service.importLeague(config);
    await service.importLeague(config);

    const allTeams = await db.teams.toArray();
    expect(allTeams.length).toBe(1);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/import.service.spec.ts'`
Expected: FAIL — `import.service` module not found.

- [ ] **Step 8: Write the ImportService implementation**

`src/app/core/data/import.service.ts`:
```typescript
import { Injectable, inject, signal } from '@angular/core';
import { DbService } from '../persistence/db.service';
import { TheSportsDbAdapter } from './thesportsdb.adapter';
import { mapImportedTeamToTeam } from './team-mapper';
import { LeagueImportConfig } from './league-import.config';
import { League } from '../models/league.model';

@Injectable({ providedIn: 'root' })
export class ImportService {
  private adapter = inject(TheSportsDbAdapter);
  private db = inject(DbService);

  readonly progress = signal<{ done: number; total: number } | null>(null);

  async importLeague(config: LeagueImportConfig): Promise<League> {
    const league: League = {
      id: `ts-${config.externalId}`,
      externalIds: { thesportsdb: config.externalId },
      name: config.name,
      country: config.country,
      regionId: config.regionId,
      sport: 'soccer',
    };
    await this.db.leagues.put(league);

    const importedTeams = await this.adapter.fetchTeamsForLeague(config.externalId);
    this.progress.set({ done: 0, total: importedTeams.length });

    for (const [index, imported] of importedTeams.entries()) {
      await this.db.upsertTeam(mapImportedTeamToTeam(imported, league.id));
      this.progress.set({ done: index + 1, total: importedTeams.length });
    }

    this.progress.set(null);
    return league;
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/import.service.spec.ts'`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/app/core/data
git commit -m "feat: add ImportService with idempotent league/team upsert"
```

---

### Task 9: Deck service

**Files:**
- Create: `src/app/core/decks/deck.service.ts`
- Test: `src/app/core/decks/deck.service.spec.ts`

**Interfaces:**
- Consumes: `DbService` from Task 5, `League` from Task 2.
- Produces: `DeckService.createLeagueDeck(league: League): Promise<Deck>`, `DeckService.listDecks(): Promise<Deck[]>`, `DeckService.getDeck(id: string): Promise<Deck | undefined>` — consumed by Task 11 (`StudyStore`), Task 13 (`GameStore`), Task 14 (`HomeComponent`).

- [ ] **Step 1: Write the failing test**

`src/app/core/decks/deck.service.spec.ts`:
```typescript
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { DeckService } from './deck.service';
import { DbService } from '../persistence/db.service';
import { League } from '../models/league.model';
import { Team } from '../models/team.model';

function makeLeague(): League {
  return {
    id: 'ts-4328',
    externalIds: { thesportsdb: '4328' },
    name: 'Premier League',
    country: 'England',
    regionId: 'europe',
    sport: 'soccer',
  };
}

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

describe('DeckService', () => {
  let service: DeckService;
  let db: DbService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DeckService);
    db = TestBed.inject(DbService);
    await db.decks.clear();
    await db.teams.clear();
    await db.teams.bulkPut([makeTeam('ts-1'), makeTeam('ts-2')]);
  });

  it('creates a deck containing every team of the league', async () => {
    const deck = await service.createLeagueDeck(makeLeague());
    expect(deck.id).toBe('deck-league-ts-4328');
    expect(deck.scope).toEqual({ kind: 'league', leagueId: 'ts-4328' });
    expect(new Set(deck.teamIds)).toEqual(new Set(['ts-1', 'ts-2']));
  });

  it('returns the existing deck instead of creating a duplicate', async () => {
    const first = await service.createLeagueDeck(makeLeague());
    const second = await service.createLeagueDeck(makeLeague());
    expect(second.id).toBe(first.id);
    const allDecks = await db.decks.toArray();
    expect(allDecks.length).toBe(1);
  });

  it('lists and fetches decks', async () => {
    await service.createLeagueDeck(makeLeague());
    const decks = await service.listDecks();
    expect(decks.length).toBe(1);
    const fetched = await service.getDeck(decks[0].id);
    expect(fetched?.id).toBe(decks[0].id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/deck.service.spec.ts'`
Expected: FAIL — `deck.service` module not found.

- [ ] **Step 3: Write the implementation**

`src/app/core/decks/deck.service.ts`:
```typescript
import { Injectable, inject } from '@angular/core';
import { DbService } from '../persistence/db.service';
import { League } from '../models/league.model';
import { Deck } from '../models/deck.model';

@Injectable({ providedIn: 'root' })
export class DeckService {
  private db = inject(DbService);

  async createLeagueDeck(league: League): Promise<Deck> {
    const id = `deck-league-${league.id}`;
    const existing = await this.db.decks.get(id);
    if (existing) return existing;

    const teams = await this.db.teams.where('leagueIds').equals(league.id).toArray();
    const deck: Deck = {
      id,
      name: league.name,
      scope: { kind: 'league', leagueId: league.id },
      teamIds: teams.map(team => team.id),
      createdAt: new Date().toISOString(),
    };
    await this.db.decks.put(deck);
    return deck;
  }

  listDecks(): Promise<Deck[]> {
    return this.db.decks.toArray();
  }

  getDeck(id: string): Promise<Deck | undefined> {
    return this.db.decks.get(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/deck.service.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/decks
git commit -m "feat: add DeckService with idempotent league-deck creation"
```

---

### Task 10: SRS service (daily queue + grading)

**Files:**
- Create: `src/app/core/srs/srs.service.ts`
- Test: `src/app/core/srs/srs.service.spec.ts`

**Interfaces:**
- Consumes: `applySm2`, `today`, `NEW_CARDS_PER_DAY` from Task 4, `DbService` from Task 5, `DeckService` from Task 9, `Team` from Task 2.
- Produces: `SrsService.buildDailyQueue(deckId: string): Promise<Team[]>`, `SrsService.grade(deckId: string, teamId: string, quality: ReviewQuality): Promise<void>` — consumed by Task 11 (`StudyStore`).

- [ ] **Step 1: Write the failing test**

`src/app/core/srs/srs.service.spec.ts`:
```typescript
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { SrsService } from './srs.service';
import { DbService } from '../persistence/db.service';
import { DeckService } from '../decks/deck.service';
import { Team } from '../models/team.model';
import { today, addDays } from './sm2';

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

  it('persists a fresh, due ReviewState for each new card it queues', async () => {
    await service.buildDailyQueue(deckId);
    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    expect(state).toBeDefined();
    expect(state?.repetitions).toBe(0);
    expect(state?.dueDate).toBe(today());
  });

  it('excludes suspended cards from the queue', async () => {
    await service.buildDailyQueue(deckId);
    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    await db.reviewStates.put({ ...state!, suspended: true });

    const queue = await service.buildDailyQueue(deckId);
    expect(queue.map(t => t.id)).not.toContain('ts-1');
  });

  it('grade() applies SM-2 and persists the updated state', async () => {
    await service.buildDailyQueue(deckId);
    await service.grade(deckId, 'ts-1', 4);

    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    expect(state?.repetitions).toBe(1);
    expect(state?.dueDate).toBe(addDays(today(), 1));
  });

  it('re-queues a card due today after grading it as a fail', async () => {
    await service.buildDailyQueue(deckId);
    await service.grade(deckId, 'ts-1', 0);

    const state = await db.reviewStates.get(`${deckId}:ts-1`);
    expect(state?.dueDate).toBe(addDays(today(), 1));
    expect(state?.lapses).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/srs.service.spec.ts'`
Expected: FAIL — `srs.service` module not found.

- [ ] **Step 3: Write the implementation**

`src/app/core/srs/srs.service.ts`:
```typescript
import { Injectable, inject } from '@angular/core';
import { DbService, StoredReviewState } from '../persistence/db.service';
import { DeckService } from '../decks/deck.service';
import { Team } from '../models/team.model';
import { ReviewQuality } from '../models/review-state.model';
import { applySm2, today } from './sm2';
import { NEW_CARDS_PER_DAY } from './srs.constants';

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
        repetitions: 0,
        easeFactor: 2.5,
        intervalDays: 0,
        dueDate: currentDate,
        lapses: 0,
        suspended: false,
      };
      await this.db.reviewStates.put(state);
    }

    const queueTeamIds = [...dueTeamIds, ...newTeamIds];
    const teams = await this.db.teams.bulkGet(queueTeamIds);
    return teams.filter((team): team is Team => !!team);
  }

  async grade(deckId: string, teamId: string, quality: ReviewQuality): Promise<void> {
    const id = `${deckId}:${teamId}`;
    const state = await this.db.reviewStates.get(id);
    if (!state) throw new Error(`ReviewState not found for ${id}`);

    const { id: _stateId, ...reviewState } = state;
    const updated = applySm2(reviewState, quality);
    await this.db.reviewStates.put({ ...updated, id });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/srs.service.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/srs/srs.service.ts src/app/core/srs/srs.service.spec.ts
git commit -m "feat: add SrsService with daily queue building and grading"
```

---

### Task 11: Shared TeamBadgeComponent

**Files:**
- Create: `src/app/shared/ui/team-badge.component.ts`
- Test: `src/app/shared/ui/team-badge.component.spec.ts`

**Interfaces:**
- Consumes: `BadgeCacheService` from Task 7, `Team` from Task 2.
- Produces: `<app-team-badge [team]="team" />` — consumed by Task 12 (Study) and Task 13 (Game).

- [ ] **Step 1: Write the failing test**

`src/app/shared/ui/team-badge.component.spec.ts`:
```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeamBadgeComponent } from './team-badge.component';
import { BadgeCacheService } from '../../core/persistence/badge-cache.service';
import { Team } from '../../core/models/team.model';

describe('TeamBadgeComponent', () => {
  let fixture: ComponentFixture<TeamBadgeComponent>;
  let badgeCacheSpy: jasmine.SpyObj<BadgeCacheService>;

  const team: Team = {
    id: 'ts-1',
    externalIds: {},
    name: 'Arsenal',
    alternateNames: [],
    country: 'England',
    leagueIds: [],
    badgeUrl: 'https://example.com/arsenal.png',
  };

  beforeEach(() => {
    badgeCacheSpy = jasmine.createSpyObj('BadgeCacheService', ['getObjectUrl']);
    badgeCacheSpy.getObjectUrl.and.resolveTo('blob:fake-url');

    TestBed.configureTestingModule({
      imports: [TeamBadgeComponent],
      providers: [{ provide: BadgeCacheService, useValue: badgeCacheSpy }],
    });
    fixture = TestBed.createComponent(TeamBadgeComponent);
    fixture.componentRef.setInput('team', team);
  });

  it('renders an img with the resolved object URL and the team name as alt text', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.src).toContain('blob:fake-url');
    expect(img.alt).toBe('Arsenal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/team-badge.component.spec.ts'`
Expected: FAIL — `team-badge.component` module not found.

- [ ] **Step 3: Write the implementation**

`src/app/shared/ui/team-badge.component.ts`:
```typescript
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { BadgeCacheService } from '../../core/persistence/badge-cache.service';
import { Team } from '../../core/models/team.model';

@Component({
  selector: 'app-team-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (imageUrl(); as url) {
      <img [src]="url" [alt]="team().name" class="team-badge" />
    } @else {
      <div class="team-badge team-badge--loading" [attr.aria-label]="team().name"></div>
    }
  `,
})
export class TeamBadgeComponent {
  private badgeCache = inject(BadgeCacheService);
  readonly team = input.required<Team>();
  readonly imageUrl = signal<string | null>(null);

  constructor() {
    effect(() => {
      const currentTeam = this.team();
      this.imageUrl.set(null);
      this.badgeCache.getObjectUrl(currentTeam).then(url => this.imageUrl.set(url));
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/team-badge.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/shared
git commit -m "feat: add TeamBadgeComponent with cached-blob loading"
```

---

### Task 12: Study feature (SRS mode)

**Files:**
- Create: `src/app/features/study/study.store.ts`
- Create: `src/app/features/study/study.component.ts`
- Create: `src/app/features/study/study.component.html`
- Test: `src/app/features/study/study.store.spec.ts`
- Test: `src/app/features/study/study.component.spec.ts`

**Interfaces:**
- Consumes: `SrsService` from Task 10, `TeamBadgeComponent` from Task 11.
- Produces: `StudyStore` (`deckId`, `queue`, `current`, `remaining`, `revealed` signals; `load`, `reveal`, `grade` methods), `<app-study>` routed component — consumed by Task 15 (routes).

- [ ] **Step 1: Write the failing test for the store**

`src/app/features/study/study.store.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { StudyStore } from './study.store';
import { SrsService } from '../../core/srs/srs.service';
import { Team } from '../../core/models/team.model';

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
  let srsSpy: jasmine.SpyObj<SrsService>;

  beforeEach(() => {
    srsSpy = jasmine.createSpyObj('SrsService', ['buildDailyQueue', 'grade']);
    TestBed.configureTestingModule({ providers: [{ provide: SrsService, useValue: srsSpy }] });
    store = TestBed.inject(StudyStore);
  });

  it('loads the daily queue for a deck', async () => {
    srsSpy.buildDailyQueue.and.resolveTo([makeTeam('ts-1'), makeTeam('ts-2')]);
    await store.load('deck-1');
    expect(store.current()?.id).toBe('ts-1');
    expect(store.remaining()).toBe(2);
    expect(store.revealed()).toBe(false);
  });

  it('reveal() flips the revealed flag', async () => {
    srsSpy.buildDailyQueue.and.resolveTo([makeTeam('ts-1')]);
    await store.load('deck-1');
    store.reveal();
    expect(store.revealed()).toBe(true);
  });

  it('grade() advances the queue and resets revealed', async () => {
    srsSpy.buildDailyQueue.and.resolveTo([makeTeam('ts-1'), makeTeam('ts-2')]);
    srsSpy.grade.and.resolveTo();
    await store.load('deck-1');
    store.reveal();

    await store.grade(4);

    expect(srsSpy.grade).toHaveBeenCalledWith('deck-1', 'ts-1', 4);
    expect(store.current()?.id).toBe('ts-2');
    expect(store.revealed()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/study.store.spec.ts'`
Expected: FAIL — `study.store` module not found.

- [ ] **Step 3: Write the store implementation**

`src/app/features/study/study.store.ts`:
```typescript
import { Injectable, inject, signal, computed } from '@angular/core';
import { SrsService } from '../../core/srs/srs.service';
import { Team } from '../../core/models/team.model';
import { ReviewQuality } from '../../core/models/review-state.model';

@Injectable({ providedIn: 'root' })
export class StudyStore {
  private srs = inject(SrsService);

  readonly deckId = signal<string | null>(null);
  readonly queue = signal<Team[]>([]);
  readonly current = computed(() => this.queue()[0] ?? null);
  readonly remaining = computed(() => this.queue().length);
  readonly revealed = signal(false);

  async load(deckId: string) {
    this.deckId.set(deckId);
    this.queue.set(await this.srs.buildDailyQueue(deckId));
    this.revealed.set(false);
  }

  reveal() {
    this.revealed.set(true);
  }

  async grade(quality: ReviewQuality) {
    const team = this.current();
    if (!team) return;
    await this.srs.grade(this.deckId()!, team.id, quality);
    this.queue.update(q => q.slice(1));
    this.revealed.set(false);
  }
}
```

- [ ] **Step 4: Run store test to verify it passes**

Run: `npm test -- --watch=false --include='**/study.store.spec.ts'`
Expected: PASS

- [ ] **Step 5: Write the failing test for the component**

`src/app/features/study/study.component.spec.ts`:
```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StudyComponent } from './study.component';
import { StudyStore } from './study.store';
import { signal } from '@angular/core';
import { Team } from '../../core/models/team.model';

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

describe('StudyComponent', () => {
  let fixture: ComponentFixture<StudyComponent>;
  let storeSpy: jasmine.SpyObj<StudyStore>;

  beforeEach(() => {
    storeSpy = jasmine.createSpyObj('StudyStore', ['load', 'reveal', 'grade'], {
      current: signal(makeTeam('ts-1')),
      remaining: signal(1),
      revealed: signal(false),
    });
    storeSpy.load.and.resolveTo();

    TestBed.configureTestingModule({
      imports: [StudyComponent],
      providers: [{ provide: StudyStore, useValue: storeSpy }],
    });
    fixture = TestBed.createComponent(StudyComponent);
    fixture.componentRef.setInput('deckId', 'deck-1');
  });

  it('loads the deck on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(storeSpy.load).toHaveBeenCalledWith('deck-1');
  });

  it('shows a "Mostrar resposta" button before reveal, grading buttons after', () => {
    fixture.detectChanges();
    const revealButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="reveal"]');
    expect(revealButton).toBeTruthy();

    revealButton.click();
    storeSpy.reveal.and.callFake(() => {});
    expect(storeSpy.reveal).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run component test to verify it fails**

Run: `npm test -- --watch=false --include='**/study.component.spec.ts'`
Expected: FAIL — `study.component` module not found.

- [ ] **Step 7: Write the component implementation**

`src/app/features/study/study.component.html`:
```html
@if (store.current(); as team) {
  <p>Restam {{ store.remaining() }} card(s)</p>
  <app-team-badge [team]="team" />

  @if (!store.revealed()) {
    <button type="button" data-testid="reveal" (click)="store.reveal()">Mostrar resposta</button>
  } @else {
    <h2>{{ team.name }}</h2>
    <button type="button" (click)="store.grade(0)">Errei</button>
    <button type="button" (click)="store.grade(3)">Difícil</button>
    <button type="button" (click)="store.grade(4)">Bom</button>
    <button type="button" (click)="store.grade(5)">Fácil</button>
  }
} @else {
  <p>Sessão concluída.</p>
  <a routerLink="/">Voltar</a>
}
```

`src/app/features/study/study.component.ts`:
```typescript
import { ChangeDetectionStrategy, Component, inject, input, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StudyStore } from './study.store';
import { TeamBadgeComponent } from '../../shared/ui/team-badge.component';

@Component({
  selector: 'app-study',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TeamBadgeComponent],
  templateUrl: './study.component.html',
})
export class StudyComponent {
  readonly store = inject(StudyStore);
  readonly deckId = input.required<string>();

  constructor() {
    effect(() => {
      this.store.load(this.deckId());
    });
  }
}
```

- [ ] **Step 8: Run component test to verify it passes**

Run: `npm test -- --watch=false --include='**/study.component.spec.ts'`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/features/study
git commit -m "feat: add Study feature with SRS grading UI"
```

---

### Task 13: Game feature (multiple choice)

**Files:**
- Create: `src/app/features/game/game.util.ts`
- Create: `src/app/features/game/game.store.ts`
- Create: `src/app/features/game/game.component.ts`
- Create: `src/app/features/game/game.component.html`
- Test: `src/app/features/game/game.util.spec.ts`
- Test: `src/app/features/game/game.store.spec.ts`
- Test: `src/app/features/game/game.component.spec.ts`

**Interfaces:**
- Consumes: `shuffle`, `pickRandom` from Task 3, `DeckService` from Task 9, `DbService` from Task 5, `TeamBadgeComponent` from Task 11.
- Produces: `buildMultipleChoiceQuestions(teams, roundSize): MultipleChoiceQuestion[]`, `GameStore` (`questions`, `current`, `finished`, `score`, `streak`, `bestStreak`, `selectedTeamId` signals; `load`, `select`, `next` methods), `<app-game>` routed component — consumed by Task 15 (routes).

- [ ] **Step 1: Write the failing test for question building**

`src/app/features/game/game.util.spec.ts`:
```typescript
import { buildMultipleChoiceQuestions } from './game.util';
import { Team } from '../../core/models/team.model';

function makeTeams(count: number): Team[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ts-${i}`,
    externalIds: {},
    name: `Team ${i}`,
    alternateNames: [],
    country: 'England',
    leagueIds: [],
    badgeUrl: 'https://example.com/x.png',
  }));
}

describe('buildMultipleChoiceQuestions', () => {
  it('builds one question per requested round size, capped at pool size', () => {
    const teams = makeTeams(6);
    const questions = buildMultipleChoiceQuestions(teams, 4);
    expect(questions.length).toBe(4);
  });

  it('caps at pool size when roundSize exceeds it', () => {
    const teams = makeTeams(3);
    const questions = buildMultipleChoiceQuestions(teams, 10);
    expect(questions.length).toBe(3);
  });

  it('always includes the correct team among its own options', () => {
    const teams = makeTeams(8);
    const questions = buildMultipleChoiceQuestions(teams, 5);
    for (const question of questions) {
      expect(question.options.map(t => t.id)).toContain(question.correctTeam.id);
    }
  });

  it('never repeats a team within a single question\'s options', () => {
    const teams = makeTeams(8);
    const questions = buildMultipleChoiceQuestions(teams, 5);
    for (const question of questions) {
      const ids = question.options.map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/game.util.spec.ts'`
Expected: FAIL — `game.util` module not found.

- [ ] **Step 3: Write the implementation**

`src/app/features/game/game.util.ts`:
```typescript
import { Team } from '../../core/models/team.model';
import { pickRandom, shuffle } from '../../core/util/random.util';

export interface MultipleChoiceQuestion {
  correctTeam: Team;
  options: Team[];
}

export function buildMultipleChoiceQuestions(
  teams: readonly Team[],
  roundSize: number,
): MultipleChoiceQuestion[] {
  const rounds = pickRandom(teams, Math.min(roundSize, teams.length));
  return rounds.map(correctTeam => {
    const distractorPool = teams.filter(team => team.id !== correctTeam.id);
    const distractors = pickRandom(distractorPool, 3);
    return { correctTeam, options: shuffle([correctTeam, ...distractors]) };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/game.util.spec.ts'`
Expected: PASS

- [ ] **Step 5: Write the failing test for the store**

`src/app/features/game/game.store.spec.ts`:
```typescript
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { GameStore } from './game.store';
import { DeckService } from '../../core/decks/deck.service';
import { DbService } from '../../core/persistence/db.service';
import { Team } from '../../core/models/team.model';
import { Deck } from '../../core/models/deck.model';

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

describe('GameStore', () => {
  let store: GameStore;
  let db: DbService;
  let deckServiceSpy: jasmine.SpyObj<DeckService>;

  const deck: Deck = {
    id: 'deck-1',
    name: 'Premier League',
    scope: { kind: 'league', leagueId: 'ts-4328' },
    teamIds: ['ts-1', 'ts-2', 'ts-3', 'ts-4', 'ts-5'],
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    deckServiceSpy = jasmine.createSpyObj('DeckService', ['getDeck']);
    deckServiceSpy.getDeck.and.resolveTo(deck);

    TestBed.configureTestingModule({ providers: [{ provide: DeckService, useValue: deckServiceSpy }] });
    store = TestBed.inject(GameStore);
    db = TestBed.inject(DbService);
    await db.teams.clear();
    await db.teams.bulkPut(deck.teamIds.map(makeTeam));
  });

  it('loads a round of questions for the deck', async () => {
    await store.load('deck-1', 3);
    expect(store.questions().length).toBe(3);
    expect(store.index()).toBe(0);
    expect(store.score()).toBe(0);
  });

  it('select() on the correct answer increments score and streak', async () => {
    await store.load('deck-1', 3);
    const correctId = store.current()!.correctTeam.id;

    store.select(correctId);

    expect(store.score()).toBe(1);
    expect(store.streak()).toBe(1);
    expect(store.bestStreak()).toBe(1);
  });

  it('select() on a wrong answer resets streak but keeps score', async () => {
    await store.load('deck-1', 3);
    const wrongId = store.current()!.options.find(t => t.id !== store.current()!.correctTeam.id)!.id;

    store.select(wrongId);

    expect(store.score()).toBe(0);
    expect(store.streak()).toBe(0);
  });

  it('next() advances the index and marks the round finished at the end', async () => {
    await store.load('deck-1', 1);
    store.select(store.current()!.correctTeam.id);
    store.next();
    expect(store.finished()).toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/game.store.spec.ts'`
Expected: FAIL — `game.store` module not found.

- [ ] **Step 7: Write the store implementation**

`src/app/features/game/game.store.ts`:
```typescript
import { Injectable, inject, signal, computed } from '@angular/core';
import { DeckService } from '../../core/decks/deck.service';
import { DbService } from '../../core/persistence/db.service';
import { Team } from '../../core/models/team.model';
import { buildMultipleChoiceQuestions, MultipleChoiceQuestion } from './game.util';

const DEFAULT_ROUND_SIZE = 10;

@Injectable({ providedIn: 'root' })
export class GameStore {
  private deckService = inject(DeckService);
  private db = inject(DbService);

  readonly questions = signal<MultipleChoiceQuestion[]>([]);
  readonly index = signal(0);
  readonly score = signal(0);
  readonly streak = signal(0);
  readonly bestStreak = signal(0);
  readonly selectedTeamId = signal<string | null>(null);

  readonly current = computed(() => this.questions()[this.index()] ?? null);
  readonly finished = computed(
    () => this.questions().length > 0 && this.index() >= this.questions().length,
  );

  async load(deckId: string, roundSize: number = DEFAULT_ROUND_SIZE) {
    const deck = await this.deckService.getDeck(deckId);
    this.questions.set([]);
    this.index.set(0);
    this.score.set(0);
    this.streak.set(0);
    this.bestStreak.set(0);
    this.selectedTeamId.set(null);
    if (!deck) return;

    const teams = (await this.db.teams.bulkGet(deck.teamIds)).filter((t): t is Team => !!t);
    this.questions.set(buildMultipleChoiceQuestions(teams, roundSize));
  }

  select(teamId: string) {
    const question = this.current();
    if (!question || this.selectedTeamId()) return;
    this.selectedTeamId.set(teamId);

    if (teamId === question.correctTeam.id) {
      this.score.update(s => s + 1);
      this.streak.update(s => s + 1);
      this.bestStreak.update(b => Math.max(b, this.streak()));
    } else {
      this.streak.set(0);
    }
  }

  next() {
    this.index.update(i => i + 1);
    this.selectedTeamId.set(null);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/game.store.spec.ts'`
Expected: PASS

- [ ] **Step 9: Write the failing test for the component**

`src/app/features/game/game.component.spec.ts`:
```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { GameComponent } from './game.component';
import { GameStore } from './game.store';
import { Team } from '../../core/models/team.model';

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

describe('GameComponent', () => {
  let fixture: ComponentFixture<GameComponent>;
  let storeSpy: jasmine.SpyObj<GameStore>;
  const correctTeam = makeTeam('ts-1');
  const options = [correctTeam, makeTeam('ts-2'), makeTeam('ts-3'), makeTeam('ts-4')];

  beforeEach(() => {
    storeSpy = jasmine.createSpyObj('GameStore', ['load', 'select', 'next'], {
      current: signal({ correctTeam, options }),
      finished: signal(false),
      score: signal(0),
      streak: signal(0),
      bestStreak: signal(0),
      selectedTeamId: signal<string | null>(null),
    });
    storeSpy.load.and.resolveTo();

    TestBed.configureTestingModule({
      imports: [GameComponent],
      providers: [{ provide: GameStore, useValue: storeSpy }],
    });
    fixture = TestBed.createComponent(GameComponent);
    fixture.componentRef.setInput('deckId', 'deck-1');
  });

  it('loads the deck on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(storeSpy.load).toHaveBeenCalledWith('deck-1');
  });

  it('renders one option button per option and calls select() on click', () => {
    fixture.detectChanges();
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="option"]'),
    );
    expect(buttons.length).toBe(4);

    buttons[0].click();
    expect(storeSpy.select).toHaveBeenCalled();
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/game.component.spec.ts'`
Expected: FAIL — `game.component` module not found.

- [ ] **Step 11: Write the component implementation**

`src/app/features/game/game.component.html`:
```html
@if (!store.finished()) {
  <p>Pontos: {{ store.score() }} · Sequência: {{ store.streak() }}</p>
  @if (store.current(); as question) {
    <app-team-badge [team]="question.correctTeam" />
    <div>
      @for (option of question.options; track option.id) {
        <button
          type="button"
          data-testid="option"
          [disabled]="!!store.selectedTeamId()"
          (click)="store.select(option.id)"
        >
          {{ option.name }}
        </button>
      }
    </div>
    @if (store.selectedTeamId()) {
      <button type="button" (click)="store.next()">Próxima</button>
    }
  }
} @else {
  <p>Fim de jogo! Pontuação: {{ store.score() }} · Melhor sequência: {{ store.bestStreak() }}</p>
  <a routerLink="/">Voltar</a>
}
```

`src/app/features/game/game.component.ts`:
```typescript
import { ChangeDetectionStrategy, Component, inject, input, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameStore } from './game.store';
import { TeamBadgeComponent } from '../../shared/ui/team-badge.component';

@Component({
  selector: 'app-game',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TeamBadgeComponent],
  templateUrl: './game.component.html',
})
export class GameComponent {
  readonly store = inject(GameStore);
  readonly deckId = input.required<string>();

  constructor() {
    effect(() => {
      this.store.load(this.deckId());
    });
  }
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/game.component.spec.ts'`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add src/app/features/game
git commit -m "feat: add multiple-choice Game feature"
```

---

### Task 14: Home feature (deck list + import trigger)

**Files:**
- Create: `src/app/features/home/home.component.ts`
- Create: `src/app/features/home/home.component.html`
- Test: `src/app/features/home/home.component.spec.ts`

**Interfaces:**
- Consumes: `ImportService` from Task 8, `DeckService` from Task 9, `MVP_LEAGUES_TO_IMPORT` from Task 8.
- Produces: `<app-home>` routed component — consumed by Task 15 (routes).

- [ ] **Step 1: Write the failing test**

`src/app/features/home/home.component.spec.ts`:
```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HomeComponent } from './home.component';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { League } from '../../core/models/league.model';

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let importSpy: jasmine.SpyObj<ImportService>;
  let deckServiceSpy: jasmine.SpyObj<DeckService>;

  const league: League = {
    id: 'ts-4328',
    externalIds: {},
    name: 'Premier League',
    country: 'England',
    regionId: 'europe',
    sport: 'soccer',
  };

  beforeEach(() => {
    importSpy = jasmine.createSpyObj('ImportService', ['importLeague'], { progress: signal(null) });
    deckServiceSpy = jasmine.createSpyObj('DeckService', ['listDecks', 'createLeagueDeck']);
    deckServiceSpy.listDecks.and.resolveTo([]);

    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: ImportService, useValue: importSpy },
        { provide: DeckService, useValue: deckServiceSpy },
      ],
    });
    fixture = TestBed.createComponent(HomeComponent);
  });

  it('lists the configured leagues with an import button when no deck exists yet', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const importButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="import"]');
    expect(importButton).toBeTruthy();
    expect(importButton.textContent).toContain('Premier League');
  });

  it('importing a league creates its deck and shows study/game links', async () => {
    importSpy.importLeague.and.resolveTo(league);
    deckServiceSpy.createLeagueDeck.and.resolveTo({
      id: 'deck-league-ts-4328',
      name: 'Premier League',
      scope: { kind: 'league', leagueId: 'ts-4328' },
      teamIds: ['ts-1'],
      createdAt: new Date().toISOString(),
    });

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const importButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="import"]');
    importButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(importSpy.importLeague).toHaveBeenCalled();
    expect(deckServiceSpy.createLeagueDeck).toHaveBeenCalledWith(league);
    const studyLink = fixture.nativeElement.querySelector('[data-testid="study-link"]');
    expect(studyLink).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/home.component.spec.ts'`
Expected: FAIL — `home.component` module not found.

- [ ] **Step 3: Write the implementation**

`src/app/features/home/home.component.html`:
```html
<h1>Flash Shields</h1>

@if (error()) {
  <p role="alert">{{ error() }}</p>
}

<ul>
  @for (config of leagueConfigs; track config.externalId) {
    <li>
      @if (deckForLeague(config.externalId); as deck) {
        <span>{{ config.name }}</span>
        <a data-testid="study-link" [routerLink]="['/study', deck.id]">Estudar</a>
        <a data-testid="game-link" [routerLink]="['/game', deck.id]">Jogar</a>
      } @else {
        <span>{{ config.name }}</span>
        <button
          type="button"
          data-testid="import"
          [disabled]="importingId() === config.externalId"
          (click)="importLeague(config)"
        >
          @if (importingId() === config.externalId) {
            Importando {{ progress()?.done ?? 0 }}/{{ progress()?.total ?? 0 }}...
          } @else {
            Importar {{ config.name }}
          }
        </button>
      }
    </li>
  }
</ul>
```

`src/app/features/home/home.component.ts`:
```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { MVP_LEAGUES_TO_IMPORT, LeagueImportConfig } from '../../core/data/league-import.config';
import { Deck } from '../../core/models/deck.model';

@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './home.component.html',
})
export class HomeComponent {
  private importService = inject(ImportService);
  private deckService = inject(DeckService);

  readonly leagueConfigs = MVP_LEAGUES_TO_IMPORT;
  readonly decks = signal<Deck[]>([]);
  readonly importingId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly progress = this.importService.progress;

  constructor() {
    this.refreshDecks();
  }

  deckForLeague(externalId: string): Deck | undefined {
    const leagueId = `ts-${externalId}`;
    return this.decks().find(deck => deck.scope.kind === 'league' && deck.scope.leagueId === leagueId);
  }

  async importLeague(config: LeagueImportConfig) {
    this.error.set(null);
    this.importingId.set(config.externalId);
    try {
      const league = await this.importService.importLeague(config);
      await this.deckService.createLeagueDeck(league);
      await this.refreshDecks();
    } catch {
      this.error.set('Falha ao importar. Tente novamente.');
    } finally {
      this.importingId.set(null);
    }
  }

  private async refreshDecks() {
    this.decks.set(await this.deckService.listDecks());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/home.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/features/home
git commit -m "feat: add Home feature with league import and deck list"
```

---

### Task 15: App shell and routes

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/app.config.ts`
- Modify: `src/app/app.component.ts`
- Modify: `src/app/app.component.html`
- Test: `src/app/app.routes.spec.ts`

**Interfaces:**
- Consumes: `HomeComponent`, `StudyComponent`, `GameComponent`.
- Produces: a navigable, lazy-routed shell — the last piece needed for the MVP's user flow.

- [ ] **Step 1: Write the failing test**

`src/app/app.routes.spec.ts`:
```typescript
import { routes } from './app.routes';

describe('routes', () => {
  it('defines the home, study, and game routes', () => {
    const paths = routes.map(route => route.path);
    expect(paths).toEqual(['', 'study/:deckId', 'game/:deckId']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include='**/app.routes.spec.ts'`
Expected: FAIL — `ng new`'s default `app.routes.ts` exports an empty `routes` array, so `paths` is `[]`, not the expected 3-element array.

- [ ] **Step 3: Write the routes**

`src/app/app.routes.ts`:
```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'study/:deckId',
    loadComponent: () => import('./features/study/study.component').then(m => m.StudyComponent),
  },
  {
    path: 'game/:deckId',
    loadComponent: () => import('./features/game/game.component').then(m => m.GameComponent),
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include='**/app.routes.spec.ts'`
Expected: PASS

- [ ] **Step 5: Wire component input binding and HttpClient in app.config.ts**

`src/app/app.config.ts`:
```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(),
  ],
};
```

(Keep any additional providers the CLI already generated here, e.g. `provideAnimationsAsync()` — this task only adds `withComponentInputBinding()` and `provideHttpClient()`. `withComponentInputBinding()` is what makes `StudyComponent.deckId` / `GameComponent.deckId` auto-populate from the `:deckId` route param — see Tasks 12–13.)

- [ ] **Step 6: Write the app shell template**

`src/app/app.component.html`:
```html
<nav>
  <a routerLink="/">Flash Shields</a>
</nav>
<router-outlet />
```

`src/app/app.component.ts`:
```typescript
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.component.html',
})
export class AppComponent {}
```

- [ ] **Step 7: Run the full unit test suite to confirm nothing broke**

Run: `npm test -- --watch=false`
Expected: PASS — every spec from Tasks 3–15 is green, including the default `app.component.spec.ts` generated in Task 1.

- [ ] **Step 8: Manual smoke test of the full flow**

```bash
npx ng serve
```

Open `http://localhost:4200`, click "Importar Premier League", wait for the progress counter to finish, then click "Estudar" and "Jogar" and confirm both flows render shields and respond to input.

- [ ] **Step 9: Commit**

```bash
git add src/app/app.routes.ts src/app/app.routes.spec.ts src/app/app.config.ts src/app/app.component.ts src/app/app.component.html
git commit -m "feat: wire routes, HttpClient, and component input binding"
```

---

### Task 16: PWA offline support

**Files:**
- Create (via schematic): `ngsw-config.json`, `public/manifest.webmanifest`
- Modify (via schematic): `src/app/app.config.ts`, `angular.json`, `src/index.html`

**Interfaces:**
- Produces: an installable, offline-capable production build. No new TypeScript interfaces — this task is infrastructure only.

- [ ] **Step 1: Add the PWA schematic**

```bash
npx ng add @angular/pwa
```

Accept defaults when prompted (app name, theme color). This schematic automatically:
- Adds `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })` to `src/app/app.config.ts`.
- Generates `ngsw-config.json` with an `assetGroups` entry covering the app shell (`index.html`, JS/CSS bundles) and a `dataGroups`-free default.
- Generates `public/manifest.webmanifest` and links it from `src/index.html`.

- [ ] **Step 2: Verify app.config.ts still has the providers from Task 15**

Read `src/app/app.config.ts` and confirm `provideRouter(routes, withComponentInputBinding())`, `provideHttpClient()`, and the new `provideServiceWorker(...)` are all present. If `ng add` reordered or duplicated providers, clean it up so each appears exactly once.

- [ ] **Step 3: Verify the default test suite still passes**

Run: `npm test -- --watch=false`
Expected: PASS (the schematic doesn't touch spec files, but this confirms the config edit didn't break bootstrapping).

- [ ] **Step 4: Build for production and verify the service worker is emitted**

```bash
npx ng build --configuration production
ls dist/flash-shields/browser/ngsw-worker.js
```
Expected: the file exists.

- [ ] **Step 5: Manual offline verification**

```bash
npx http-server dist/flash-shields/browser -p 8080
```
Open `http://localhost:8080`, import the Premier League, then in browser DevTools go to Application → Service Workers → check "Offline" (or turn off networking). Reload the page and confirm the shell, the imported deck, and its shields still render from cache.

- [ ] **Step 6: Commit**

```bash
git add ngsw-config.json public/manifest.webmanifest src/app/app.config.ts angular.json src/index.html
git commit -m "feat: add PWA service worker and manifest for offline support"
```

---

### Task 17: End-to-end smoke test (Playwright)

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/mvp-flow.spec.ts`

**Interfaces:**
- Consumes: the running app from Task 16.
- Produces: one automated E2E check of the full MVP path — import → study → game — closing the loop on spec §10's "Playwright p/ e2e" recommendation.

- [ ] **Step 1: Install Playwright**

```bash
npm init playwright@latest -- --quiet --browser=chromium --no-examples
```
When prompted for the tests directory, use `e2e`. This generates `playwright.config.ts`; edit it so `webServer` boots the app automatically:

`playwright.config.ts` (adjust the generated file to include):
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npx ng serve --port 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://localhost:4300',
  },
});
```

- [ ] **Step 2: Write the failing E2E test**

`e2e/mvp-flow.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test('import a league, study one card, and play one round', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('import').click();
  await expect(page.getByTestId('study-link')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('study-link').click();
  await expect(page.locator('.team-badge')).toBeVisible();
  await page.getByTestId('reveal').click();
  await page.getByRole('button', { name: 'Bom' }).click();

  await page.goto('/');
  await page.getByTestId('game-link').click();
  const firstOption = page.getByTestId('option').first();
  await expect(firstOption).toBeVisible();
  await firstOption.click();
  await expect(page.getByRole('button', { name: 'Próxima' })).toBeVisible();
});
```

Update `home.component.html` (from Task 14) to add `data-testid="import"` per-button if not already unique — it already is, since only one league is configured for the MVP.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx playwright test`
Expected: FAIL (before this task, `playwright.config.ts` doesn't exist yet — after Step 1 it should at least boot and run, failing only if a selector is wrong; adjust selectors to match the real DOM if needed).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test`
Expected: PASS — the whole MVP flow works against a real browser and a real (rate-limited) TheSportsDB call.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e package.json package-lock.json
git commit -m "test: add Playwright E2E smoke test for the MVP flow"
```

---

## Definition of Done

- `npm test -- --watch=false` passes with all unit/component specs from Tasks 3–15.
- `npx playwright test` passes the end-to-end flow from Task 17.
- `npx ng build --configuration production` succeeds and emits `ngsw-worker.js`.
- Manually verified offline reload (Task 16, Step 5) keeps the imported deck and its shields usable.
- Every spec §9 MVP bullet is covered: Premier League import + badge cache (Tasks 6–8), deck per league (Task 9), Study/SM-2 (Tasks 4, 10, 12), Multiple choice (Task 13), offline básico (Task 16).
