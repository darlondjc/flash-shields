# Reestruturação de navegação + módulo de Pesquisa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bottom nav + Home-embedded league picker with a 4-card Home menu, dedicated Estudo/Jogos/Pesquisa routes, and a boot-time import splash that guarantees every league/team/deck (and their badge images) is ready before the app is used.

**Architecture:** Extract the país→liga grouping and lazy-import logic that lives in `home.ts` today into a shared util (`league-catalog.ts`) and a new `LeaguePicker` component, reused by two thin routes (`/estudo`, `/jogos`) via Angular's route-data-to-signal-input binding (`withComponentInputBinding()`, already enabled). Add a new `Search` feature (`/pesquisa`) for país→liga→time browsing and a team detail view, backed by a new `TeamService`. Add a new `AppInitService` that runs before the router outlet renders, importing any missing league/team/deck data and then warming the browser's image cache for every badge (working around the third-party CDN's missing CORS headers, which already blocks `BadgeCacheService`'s blob caching).

**Tech Stack:** Angular 22 (standalone components, signal `input()`, `withComponentInputBinding()`), Dexie/IndexedDB, Vitest (`@angular/build:unit-test` runner), Playwright for e2e.

## Global Constraints

- No artilheiro/títulos/maior título on the team detail screen — TheSportsDB's free tier doesn't provide them structurally. Only show fields the API already provides: nome, apelido, país, ano de fundação/idade, nomes alternativos, ligas.
- Badge images are never cached as IndexedDB blobs in bulk — TheSportsDB's CDN (`r2.thesportsdb.com`) sends no CORS header, so `HttpClient`'s blob fetch fails for effectively every badge (see the existing comment in `badge-cache.service.ts`). Bulk warming only uses `new Image()` to prime the browser's native HTTP cache, never `BadgeCacheService`.
- `comingSoon: true` leagues (Copa do Mundo, Copa América, Eurocopa) stay out of the automatic import and out of Pesquisa, same as today.
- Search matching is case-insensitive substring only — no accent normalization in this delivery ("Sao Paulo" does not match "São Paulo").
- Every screen's top-bar left icon is `Home01Icon` linking to `/`; it is the same across every screen and never means "go back one level" — per-level back stays as an explicit "Trocar país/liga" button in the content area, following the pattern already in `home.html`.

---

## Task 1: Navigation shell — remove bottom nav, swap header icon to Home

**Files:**
- Modify: `src/app/app.html`
- Modify: `src/app/app.scss`
- Modify: `src/app/app.ts`
- Modify: `src/app/app.spec.ts`
- Modify: `src/styles.scss`
- Modify: `src/app/features/study/study.html`
- Modify: `src/app/features/study/study.ts`
- Modify: `src/app/features/game/game.html`
- Modify: `src/app/features/game/game.ts`
- Modify: `src/app/features/stats/stats.html`
- Modify: `src/app/features/settings/settings.html`

**Interfaces:**
- Produces: no new files. `study.back()`/`game.back()` simplified to `this.router.navigate(['/'])` (no query params) — nothing downstream in this plan calls these methods with an expectation of query params.

- [x] **Step 1: Update the failing/changed test for the app shell**

Replace the bottom-nav test in `src/app/app.spec.ts` with one that asserts it's gone:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('creates the app shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('does not render a bottom navigation bar', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.bottom-nav')).toBeFalsy();
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `npx ng test --include='src/app/app.spec.ts' --watch=false`
Expected: FAIL — `.bottom-nav` still renders.

- [x] **Step 3: Remove the bottom nav from the app shell**

Replace `src/app/app.html` with:

```html
<div class="app-shell">
  <router-outlet />
</div>
```

Replace `src/app/app.ts` with:

```typescript
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // Instantiating ThemeService here (rather than only where Settings injects
  // it) is what makes the theme apply app-wide from first paint, not just
  // after visiting /settings.
  private readonly theme = inject(ThemeService);
}
```

Remove the `.bottom-nav` and `.bottom-nav__item` rules from `src/app/app.scss`, leaving only:

```scss
:host {
  display: block;
  min-height: 100%;
  background: radial-gradient(ellipse at top, var(--shell-glow) 0%, var(--bg) 55%);
}

.app-shell {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--bg);
  box-shadow: 0 0 60px var(--shell-shadow);
  position: relative;
}
```

In `src/styles.scss`, shrink the now-unneeded bottom clearance on `.screen` (it was reserved for the removed bottom nav):

```scss
.screen {
  max-width: 480px;
  margin: 0 auto;
  padding: 1.25rem 1.25rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
```

- [x] **Step 4: Run it to confirm it passes**

Run: `npx ng test --include='src/app/app.spec.ts' --watch=false`
Expected: PASS

- [x] **Step 5: Swap the header icon to Home in Study, Game, Stats, Settings**

`src/app/features/study/study.ts` — replace the `ArrowLeft01Icon` import/field and simplify `back()`:

```typescript
import { ChangeDetectionStrategy, Component, computed, inject, input, effect } from '@angular/core';
import { Router } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { Home01Icon } from '@hugeicons/core-free-icons';
import { StudyStore } from './study.store';
import { TeamBadge } from '../../shared/ui/team-badge';

@Component({
  selector: 'app-study',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TeamBadge, HugeiconsIconComponent],
  templateUrl: './study.html',
  styleUrl: './study.scss',
})
export class Study {
  readonly store = inject(StudyStore);
  private router = inject(Router);
  readonly deckId = input.required<string>();

  readonly Home01Icon = Home01Icon;

  readonly progressPercent = computed(() => {
    const total = this.store.total();
    if (total === 0) return 0;
    return ((total - this.store.remaining()) / total) * 100;
  });

  constructor() {
    effect(() => {
      this.store.load(this.deckId());
    });
  }

  back() {
    const sessionInProgress = !!this.store.current();
    if (sessionInProgress && !confirm('Sair do estudo? Sua sessão será interrompida.')) {
      return;
    }
    this.router.navigate(['/']);
  }
}
```

`src/app/features/study/study.html` — update just the header button:

```html
<header class="app-header">
  <div class="app-header__side">
    <button type="button" class="icon-btn" aria-label="Início" (click)="back()">
      <hugeicons-icon [icon]="Home01Icon" [size]="20" [strokeWidth]="1.8" color="currentColor" />
    </button>
  </div>
  <div class="app-header__title">Estudo (SRS)</div>
  <div class="app-header__side">
    <span class="counter-pill">{{ store.total() - store.remaining() }} / {{ store.total() }}</span>
  </div>
</header>
```

`src/app/features/game/game.ts` — same pattern, replacing the icon import and simplifying `back()` (keep `ArrowLeft01Icon` removed, `Home01Icon` added, `ActivatedRoute` import removed since `returnLeagueId` goes away — but keep it if still used for reading `mode`; it is, so keep the import, just drop the `returnLeagueId` field):

```typescript
import { ChangeDetectionStrategy, Component, inject, input, effect, DestroyRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { Home01Icon, FireIcon } from '@hugeicons/core-free-icons';
import { map } from 'rxjs/operators';
import { GameMode } from '../../core/models/session.model';
import { GameStore } from './game.store';
import { Question } from './game.util';
import { TeamBadge } from '../../shared/ui/team-badge';

const AUTO_ADVANCE_DELAY_MS = 1200;

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TeamBadge, HugeiconsIconComponent],
  templateUrl: './game.html',
  styleUrl: './game.scss',
})
export class Game {
  readonly store = inject(GameStore);
  readonly route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly deckId = input.required<string>();

  readonly Home01Icon = Home01Icon;
  readonly FireIcon = FireIcon;
  readonly autoAdvanceDelayMs = AUTO_ADVANCE_DELAY_MS;

  private mode = toSignal(
    this.route.queryParams.pipe(map(params => (params['mode'] as GameMode) ?? 'multiple-choice')),
    { initialValue: 'multiple-choice' as GameMode },
  );

  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const deckId = this.deckId();
      const mode = this.mode();
      if (deckId) {
        this.store.load(deckId, mode);
      }
    });

    effect(() => {
      const selected = this.store.selectedTeamId();
      this.clearAutoAdvance();
      if (selected) {
        this.autoAdvanceTimer = setTimeout(() => {
          this.autoAdvanceTimer = null;
          this.store.next();
        }, AUTO_ADVANCE_DELAY_MS);
      }
    });

    inject(DestroyRef).onDestroy(() => this.clearAutoAdvance());
  }

  private clearAutoAdvance() {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  back() {
    const sessionInProgress = this.store.total() > 0 && !this.store.finished();
    if (sessionInProgress && !confirm('Sair do jogo? A pontuação desta partida será perdida.')) {
      return;
    }
    this.router.navigate(['/']);
  }

  optionState(optionId: string, correctTeamId: string): 'correct' | 'incorrect' | 'neutral' {
    const selected = this.store.selectedTeamId();
    if (!selected) return 'neutral';
    if (optionId === correctTeamId) return 'correct';
    if (optionId === selected) return 'incorrect';
    return 'neutral';
  }

  onBadgeLoadFailed(question: Question, teamId: string) {
    this.store.handleBadgeLoadFailure(question, teamId);
  }
}
```

`src/app/features/game/game.html` — update just the header button (same swap as Study: `aria-label="Início"`, `[icon]="Home01Icon"`).

`src/app/features/stats/stats.html` — swap the anchor's icon/label:

```html
<header class="app-header">
  <div class="app-header__side">
    <a routerLink="/" class="icon-btn" aria-label="Início">
      <hugeicons-icon [icon]="Home01Icon" [size]="20" [strokeWidth]="1.8" color="currentColor" />
    </a>
  </div>
  <div class="app-header__title">Estatísticas</div>
  <div class="app-header__side"></div>
</header>
```

This requires `stats.ts` to import `Home01Icon` instead of `ArrowLeft01Icon` (mirror the same one-line swap done in `study.ts`/`game.ts`: change the import and the `readonly ArrowLeft01Icon = ArrowLeft01Icon;` field to `Home01Icon`).

`src/app/features/settings/settings.html` — same anchor swap; `settings.ts` swaps `ArrowLeft01Icon` → `Home01Icon` the same way (keep `Delete01Icon`, that one is unrelated to this task).

- [x] **Step 6: Run the full unit test suite**

Run: `npx ng test --watch=false`
Expected: PASS (no test asserted on the old `ArrowLeft01Icon`/"Voltar" label, confirmed by grep before writing this plan)

- [ ] **Step 7: Commit**

```bash
git add src/app/app.html src/app/app.scss src/app/app.ts src/app/app.spec.ts src/styles.scss \
  src/app/features/study/study.html src/app/features/study/study.ts \
  src/app/features/game/game.html src/app/features/game/game.ts \
  src/app/features/stats/stats.html src/app/features/stats/stats.ts \
  src/app/features/settings/settings.html src/app/features/settings/settings.ts
git commit -m "refactor: remove bottom nav, use Home icon as the top-bar back action"
```

---

## Task 2: Extract `league-catalog` util (país→liga grouping)

**Files:**
- Create: `src/app/core/leagues/league-catalog.ts`
- Test: `src/app/core/leagues/league-catalog.spec.ts`

**Interfaces:**
- Produces: `countryOptions(configs: LeagueImportConfig[]): CountryOption[]`, `leaguesForCountry(configs: LeagueImportConfig[], country: string): LeagueImportConfig[]`, `countryFlag(country: string): string`, and the `CountryOption` interface (`{ name: string; flag: string; count: number }`). Consumed by `LeaguePicker` (Task 5) and `Search` (Task 6).

- [x] **Step 1: Write the failing test**

```typescript
import { countryOptions, leaguesForCountry, countryFlag } from './league-catalog';
import { LeagueImportConfig } from '../data/league-import.config';

const configs: LeagueImportConfig[] = [
  { externalId: '4328', name: 'Premier League', country: 'Inglaterra', regionId: 'europe' },
  { externalId: '4329', name: 'Championship', country: 'Inglaterra', regionId: 'europe' },
  { externalId: '4335', name: 'La Liga', country: 'Espanha', regionId: 'europe' },
  { externalId: '4356', name: 'Copa do Mundo', country: 'Internacional', regionId: 'world', comingSoon: true },
];

describe('league-catalog', () => {
  it('groups leagues by country with a count', () => {
    const options = countryOptions(configs);
    expect(options.find(o => o.name === 'Inglaterra')?.count).toBe(2);
    expect(options.find(o => o.name === 'Espanha')?.count).toBe(1);
  });

  it('returns a flag for a known country and a fallback for an unknown one', () => {
    expect(countryFlag('Brasil')).toBe('🇧🇷');
    expect(countryFlag('Nárnia')).toBe('🏟️');
  });

  it('filters leagues by country, preserving config order', () => {
    const england = leaguesForCountry(configs, 'Inglaterra');
    expect(england.map(c => c.externalId)).toEqual(['4328', '4329']);
  });

  it('includes comingSoon leagues — callers decide whether to filter them out', () => {
    const world = leaguesForCountry(configs, 'Internacional');
    expect(world).toHaveLength(1);
    expect(world[0].comingSoon).toBe(true);
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `npx ng test --include='src/app/core/leagues/league-catalog.spec.ts' --watch=false`
Expected: FAIL — `league-catalog.ts` doesn't exist yet.

- [x] **Step 3: Implement it**

```typescript
import { LeagueImportConfig } from '../data/league-import.config';

export interface CountryOption {
  name: string;
  flag: string;
  count: number;
}

const COUNTRY_FLAGS: Record<string, string> = {
  Alemanha: '🇩🇪',
  Brasil: '🇧🇷',
  Espanha: '🇪🇸',
  França: '🇫🇷',
  Inglaterra: '🇬🇧',
  Itália: '🇮🇹',
  'Países Baixos': '🇳🇱',
  Portugal: '🇵🇹',
  Internacional: '🌍',
};

export function countryFlag(country: string): string {
  return COUNTRY_FLAGS[country] ?? '🏟️';
}

export function countryOptions(configs: LeagueImportConfig[]): CountryOption[] {
  const countries = new Map<string, CountryOption>();

  for (const config of configs) {
    const existing = countries.get(config.country);
    if (!existing) {
      countries.set(config.country, { name: config.country, flag: countryFlag(config.country), count: 1 });
      continue;
    }
    existing.count += 1;
  }

  return Array.from(countries.values());
}

export function leaguesForCountry(configs: LeagueImportConfig[], country: string): LeagueImportConfig[] {
  return configs.filter(config => config.country === country);
}
```

- [x] **Step 4: Run it to confirm it passes**

Run: `npx ng test --include='src/app/core/leagues/league-catalog.spec.ts' --watch=false`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/leagues/league-catalog.ts src/app/core/leagues/league-catalog.spec.ts
git commit -m "refactor: extract país→liga grouping into a shared league-catalog util"
```

---

## Task 3: `TeamService` (get + search by name)

**Files:**
- Create: `src/app/core/leagues/team.service.ts`
- Test: `src/app/core/leagues/team.service.spec.ts`

**Interfaces:**
- Consumes: `DbService.teams` (existing Dexie table, `Table<Team, string>`).
- Produces: `TeamService.getTeam(id: string): Promise<Team | undefined>`, `TeamService.searchByName(query: string): Promise<Team[]>`. Consumed by `Search` (Tasks 6) and `AppInitService` is not a consumer (it reads `db.teams` directly for badge warming, see Task 9).

- [x] **Step 1: Write the failing test**

```typescript
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { TeamService } from './team.service';
import { DbService } from '../persistence/db.service';
import { Team } from '../models/team.model';

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'ts-4328-1',
    externalIds: { thesportsdb: '1' },
    name: 'Arsenal',
    alternateNames: [],
    country: 'England',
    leagueIds: ['ts-4328'],
    badgeUrl: 'https://example.com/arsenal.png',
    ...overrides,
  };
}

describe('TeamService', () => {
  let service: TeamService;
  let db: DbService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TeamService);
    db = TestBed.inject(DbService);
    await db.teams.clear();
  });

  it('fetches a team by id', async () => {
    await db.teams.put(makeTeam());
    const team = await service.getTeam('ts-4328-1');
    expect(team?.name).toBe('Arsenal');
  });

  it('returns undefined for a team that has not been imported yet', async () => {
    const team = await service.getTeam('ts-9999-1');
    expect(team).toBeUndefined();
  });

  it('finds a team by a case-insensitive substring of its name', async () => {
    await db.teams.put(makeTeam());
    const results = await service.searchByName('arse');
    expect(results.map(t => t.id)).toEqual(['ts-4328-1']);
  });

  it('finds a team by an alternate name', async () => {
    await db.teams.put(makeTeam({ alternateNames: ['The Gunners'] }));
    const results = await service.searchByName('gunners');
    expect(results.map(t => t.id)).toEqual(['ts-4328-1']);
  });

  it('returns an empty array when nothing matches', async () => {
    await db.teams.put(makeTeam());
    const results = await service.searchByName('nonexistent');
    expect(results).toEqual([]);
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `npx ng test --include='src/app/core/leagues/team.service.spec.ts' --watch=false`
Expected: FAIL — `team.service.ts` doesn't exist yet.

- [x] **Step 3: Implement it**

```typescript
import { Injectable, inject } from '@angular/core';
import { DbService } from '../persistence/db.service';
import { Team } from '../models/team.model';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private db = inject(DbService);

  getTeam(id: string): Promise<Team | undefined> {
    return this.db.teams.get(id);
  }

  async searchByName(query: string): Promise<Team[]> {
    const needle = query.toLowerCase();
    const allTeams = await this.db.teams.toArray();
    return allTeams.filter(team => this.matches(team, needle));
  }

  private matches(team: Team, needle: string): boolean {
    if (team.name.toLowerCase().includes(needle)) return true;
    if (team.shortName?.toLowerCase().includes(needle)) return true;
    return team.alternateNames.some(name => name.toLowerCase().includes(needle));
  }
}
```

- [x] **Step 4: Run it to confirm it passes**

Run: `npx ng test --include='src/app/core/leagues/team.service.spec.ts' --watch=false`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/leagues/team.service.ts src/app/core/leagues/team.service.spec.ts
git commit -m "feat: add TeamService with get-by-id and search-by-name"
```

---

## Task 4: `warmImageCache` util (badge cache warming)

**Files:**
- Create: `src/app/core/persistence/badge-warmer.ts`
- Test: `src/app/core/persistence/badge-warmer.spec.ts`

**Interfaces:**
- Produces: `warmImageCache(urls: string[], options?: WarmImageCacheOptions): Promise<void>`, `WarmImageCacheOptions { timeoutMs?: number; onProgress?: (done: number, total: number) => void }`. Consumed by `AppInitService` (Task 9).

- [x] **Step 1: Write the failing test**

```typescript
import { vi } from 'vitest';
import { warmImageCache } from './badge-warmer';

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  static instances: FakeImage[] = [];

  set src(value: string) {
    this._src = value;
    FakeImage.instances.push(this);
  }

  get src() {
    return this._src;
  }
}

describe('warmImageCache', () => {
  const originalImage = globalThis.Image;

  beforeEach(() => {
    FakeImage.instances = [];
    (globalThis as unknown as { Image: typeof Image }).Image = FakeImage as unknown as typeof Image;
  });

  afterEach(() => {
    globalThis.Image = originalImage;
    vi.useRealTimers();
  });

  it('resolves once every image has loaded', async () => {
    const promise = warmImageCache(['https://a.test/1.png', 'https://a.test/2.png']);

    expect(FakeImage.instances).toHaveLength(2);
    FakeImage.instances.forEach(img => img.onload?.());

    await expect(promise).resolves.toBeUndefined();
  });

  it('does not fail the batch when one image errors', async () => {
    const promise = warmImageCache(['https://a.test/1.png', 'https://a.test/broken.png']);

    FakeImage.instances[0].onload?.();
    FakeImage.instances[1].onerror?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it('gives up on a single image after the timeout without blocking the batch', async () => {
    vi.useFakeTimers();
    const promise = warmImageCache(['https://a.test/slow.png'], { timeoutMs: 5000 });

    await vi.advanceTimersByTimeAsync(5000);

    await expect(promise).resolves.toBeUndefined();
  });

  it('dedupes repeated URLs into a single request', () => {
    warmImageCache(['https://a.test/1.png', 'https://a.test/1.png']);
    expect(FakeImage.instances).toHaveLength(1);
  });

  it('reports progress as each image settles', async () => {
    const onProgress = vi.fn();
    const promise = warmImageCache(['https://a.test/1.png', 'https://a.test/2.png'], { onProgress });

    FakeImage.instances[0].onload?.();
    await Promise.resolve();
    FakeImage.instances[1].onload?.();
    await promise;

    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it('resolves immediately with an empty list', async () => {
    await expect(warmImageCache([])).resolves.toBeUndefined();
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `npx ng test --include='src/app/core/persistence/badge-warmer.spec.ts' --watch=false`
Expected: FAIL — `badge-warmer.ts` doesn't exist yet.

- [x] **Step 3: Implement it**

```typescript
const DEFAULT_TIMEOUT_MS = 5000;

export interface WarmImageCacheOptions {
  timeoutMs?: number;
  onProgress?: (done: number, total: number) => void;
}

// Warms the browser's native HTTP cache for a batch of badge URLs by letting
// an <img> load in memory without ever attaching it to the DOM or reading its
// bytes. This works even though TheSportsDB's CDN sends no CORS header (which
// blocks BadgeCacheService's blob fetch + IndexedDB caching, see
// badge-cache.service.ts) — browsers are free to cache a cross-origin image's
// HTTP response for reuse, they just refuse to let script code read the
// decoded bytes.
export function warmImageCache(urls: string[], options: WarmImageCacheOptions = {}): Promise<void> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, onProgress } = options;
  const unique = Array.from(new Set(urls));
  const total = unique.length;

  if (total === 0) {
    return Promise.resolve();
  }

  let done = 0;
  return Promise.allSettled(
    unique.map(url =>
      warmOne(url, timeoutMs).then(() => {
        done++;
        onProgress?.(done, total);
      }),
    ),
  ).then(() => undefined);
}

function warmOne(url: string, timeoutMs: number): Promise<void> {
  return new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(() => resolve(), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve();
    };
    img.src = url;
  });
}
```

- [x] **Step 4: Run it to confirm it passes**

Run: `npx ng test --include='src/app/core/persistence/badge-warmer.spec.ts' --watch=false`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/persistence/badge-warmer.ts src/app/core/persistence/badge-warmer.spec.ts
git commit -m "feat: add warmImageCache to prime the browser's HTTP cache for badge URLs"
```

---

## Task 5: `LeaguePicker` component + `/estudo` and `/jogos` routes

**Files:**
- Create: `src/app/features/league-picker/league-picker.ts`
- Create: `src/app/features/league-picker/league-picker.html`
- Test: `src/app/features/league-picker/league-picker.spec.ts`
- Modify: `src/styles.scss` (add the shared país/liga/deck-row primitives, copied from `home.scss`)
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/app.routes.spec.ts`

**Interfaces:**
- Consumes: `countryOptions`/`leaguesForCountry`/`countryFlag` from `league-catalog.ts` (Task 2); existing `ImportService`, `DeckService`, `LeagueService`.
- Produces: `LeaguePicker` component with signal inputs `actions = input<LeaguePickerAction[]>(['study', 'play', 'reverse'])` and `title = input('Selecionar liga')`, type `LeaguePickerAction = 'study' | 'play' | 'reverse'`. Routes `/estudo` and `/jogos` bind `data.actions`/`data.title` to these inputs via `withComponentInputBinding()` (already enabled in `app.config.ts`).

- [x] **Step 1: Add the shared país/liga/deck-row CSS to `styles.scss`**

Append to the end of `src/styles.scss` (copied as-is from `home.scss` — this is a copy, not a move, so the still-unmodified `home.scss` keeps working until Task 8 rewrites it and drops its own copy):

```scss
/* País/liga picker + deck action rows — shared by the league picker
   (/estudo, /jogos) and the search screen (/pesquisa). */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  gap: 0.75rem;
}

.section-header__back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0;
  cursor: pointer;
}

.league-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
  align-items: stretch;
}

.league-list--single-column {
  grid-template-columns: 1fr;
}

@media (max-width: 720px) {
  .league-list:not(.league-list--countries) {
    grid-template-columns: 1fr;
  }
}

.league-card {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.league-card--selectable {
  width: 100%;
  border: 1px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    border-color: var(--green);
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.1);
  }
}

.league-card--selected {
  gap: 1.1rem;
}

.league-card--country {
  gap: 0.65rem;
  padding: 0.9rem 0.85rem;
}

.league-card__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.league-card__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: var(--badge-chip-bg);
  overflow: hidden;

  app-league-badge {
    display: block;
    width: 100%;
    height: 100%;
  }
}

.league-card__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.league-card__name {
  font-weight: 700;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}

.league-card__meta {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.league-card__flag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: var(--surface-raised);
  font-size: 1rem;
  flex-shrink: 0;
}

.league-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: auto;
  padding-top: 0.35rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.28rem 0.6rem;
  background: var(--surface-raised);
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 600;
}

.pill--success {
  background: var(--green-dim);
  color: var(--green);
}

.league-card__cta {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--green);
}

.league-card__status {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.league-card__actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.deck-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  transition: background 0.12s ease;

  &:hover {
    background: var(--surface-header);
  }
}

.deck-row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.deck-row__icon--green {
  background: var(--green-dim);
  color: var(--green);
}

.deck-row__icon--blue {
  background: var(--blue-dim);
  color: var(--blue);
}

.deck-row__icon--purple {
  background: var(--purple-dim);
  color: var(--purple);
}

.deck-row__text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.deck-row__title {
  font-weight: 700;
  font-size: 0.9rem;
}

.deck-row__subtitle {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.deck-row__chevron {
  color: var(--text-muted);
  font-size: 1.2rem;
}
```

- [x] **Step 2: Write the failing test for `LeaguePicker`**

```typescript
import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { LeaguePicker } from './league-picker';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { LeagueService } from '../../core/leagues/league.service';
import { League } from '../../core/models/league.model';

describe('LeaguePicker', () => {
  let fixture: ComponentFixture<LeaguePicker>;
  let importSpy: { importLeague: ReturnType<typeof vi.fn>; progress: ReturnType<typeof signal> };
  let deckServiceSpy: { listDecks: ReturnType<typeof vi.fn>; createLeagueDeck: ReturnType<typeof vi.fn> };
  let leagueServiceSpy: { getLeague: ReturnType<typeof vi.fn> };

  const league: League = {
    id: 'ts-4328',
    externalIds: {},
    name: 'Premier League',
    country: 'Inglaterra',
    regionId: 'europe',
    sport: 'soccer',
  };

  const newDeck = {
    id: 'deck-league-ts-4328',
    name: 'Premier League',
    scope: { kind: 'league' as const, leagueId: 'ts-4328' },
    teamIds: ['ts-1'],
    createdAt: new Date().toISOString(),
  };

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function selectFirstLeague() {
    await settle();
    fixture.nativeElement.querySelector('[data-testid="select-country"]').click();
    await settle();
    fixture.nativeElement.querySelector('[data-testid="select-league"]').click();
    await settle();
  }

  beforeEach(async () => {
    importSpy = { importLeague: vi.fn().mockResolvedValue(league), progress: signal(null) };
    deckServiceSpy = {
      listDecks: vi.fn().mockResolvedValue([]),
      createLeagueDeck: vi.fn().mockResolvedValue(newDeck),
    };
    leagueServiceSpy = { getLeague: vi.fn().mockResolvedValue(undefined) };

    await TestBed.configureTestingModule({
      imports: [LeaguePicker],
      providers: [
        provideRouter([]),
        { provide: ImportService, useValue: importSpy },
        { provide: DeckService, useValue: deckServiceSpy },
        { provide: LeagueService, useValue: leagueServiceSpy },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LeaguePicker);
  });

  it('shows country selection cards first', async () => {
    await settle();
    expect(fixture.nativeElement.querySelector('[data-testid="select-country"]')).toBeTruthy();
  });

  it('with actions=["study"], shows only the study link after importing a league', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    fixture.componentRef.setInput('actions', ['study']);

    await selectFirstLeague();

    expect(fixture.nativeElement.querySelector('[data-testid="study-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="game-link"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="reverse-link"]')).toBeFalsy();
  });

  it('with actions=["play","reverse"], shows only the game/reverse links after importing a league', async () => {
    deckServiceSpy.listDecks.mockResolvedValueOnce([newDeck]);
    fixture.componentRef.setInput('actions', ['play', 'reverse']);

    await selectFirstLeague();

    expect(fixture.nativeElement.querySelector('[data-testid="study-link"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="game-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="reverse-link"]')).toBeTruthy();
  });
});
```

- [x] **Step 3: Run it to confirm it fails**

Run: `npx ng test --include='src/app/features/league-picker/league-picker.spec.ts' --watch=false`
Expected: FAIL — `league-picker.ts` doesn't exist yet.

- [x] **Step 4: Implement `LeaguePicker`**

```typescript
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { Home01Icon, Book01Icon, Quiz01Icon, Exchange01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { ImportService } from '../../core/data/import.service';
import { DeckService } from '../../core/decks/deck.service';
import { LeagueService } from '../../core/leagues/league.service';
import { countryOptions, leaguesForCountry, countryFlag, CountryOption } from '../../core/leagues/league-catalog';
import { LEAGUES_TO_IMPORT, LeagueImportConfig } from '../../core/data/league-import.config';
import { Deck } from '../../core/models/deck.model';
import { League } from '../../core/models/league.model';
import { LeagueBadge } from '../../shared/ui/league-badge';

export type LeaguePickerAction = 'study' | 'play' | 'reverse';

@Component({
  selector: 'app-league-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HugeiconsIconComponent, LeagueBadge],
  templateUrl: './league-picker.html',
})
export class LeaguePicker {
  private importService = inject(ImportService);
  private deckService = inject(DeckService);
  private leagueService = inject(LeagueService);
  private route = inject(ActivatedRoute);

  // Bound from route `data.actions`/`data.title` via withComponentInputBinding()
  // (see app.routes.ts) — falls back to "everything" if the component is ever
  // routed to without route data.
  readonly actions = input<LeaguePickerAction[]>(['study', 'play', 'reverse']);
  readonly title = input('Selecionar liga');

  readonly leagueConfigs = LEAGUES_TO_IMPORT;
  readonly decks = signal<Deck[]>([]);
  readonly leagues = signal<Map<string, League>>(new Map());
  readonly selected = signal<LeagueImportConfig | null>(null);
  readonly selectedCountry = signal<string | null>(null);
  readonly importingId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly Home01Icon = Home01Icon;
  readonly Book01Icon = Book01Icon;
  readonly Quiz01Icon = Quiz01Icon;
  readonly Exchange01Icon = Exchange01Icon;
  readonly CheckmarkCircle02Icon = CheckmarkCircle02Icon;

  constructor() {
    this.refreshDecks();
    this.restoreSelectionFromQueryParams();
  }

  showsAction(action: LeaguePickerAction): boolean {
    return this.actions().includes(action);
  }

  private restoreSelectionFromQueryParams() {
    const externalId = this.route.snapshot.queryParamMap.get('league');
    if (!externalId) return;

    const config = this.leagueConfigs.find(c => c.externalId === externalId);
    if (!config) return;

    this.selectedCountry.set(config.country);
    this.selected.set(config);
  }

  deckForLeague(externalId: string): Deck | undefined {
    const leagueId = `ts-${externalId}`;
    return this.decks().find(deck => deck.scope.kind === 'league' && deck.scope.leagueId === leagueId);
  }

  leagueFor(externalId: string): League | undefined {
    return this.leagues().get(`ts-${externalId}`);
  }

  countryOptions(): CountryOption[] {
    return countryOptions(this.leagueConfigs);
  }

  leaguesForCountry(country: string): LeagueImportConfig[] {
    return leaguesForCountry(this.leagueConfigs, country);
  }

  countryFlag(country: string): string {
    return countryFlag(country);
  }

  selectCountry(country: string) {
    this.error.set(null);
    this.selectedCountry.set(country);
    this.selected.set(null);
  }

  backToCountries() {
    this.selectedCountry.set(null);
    this.selected.set(null);
  }

  backToLeagues() {
    this.selected.set(null);
  }

  selectedLeague(): League | undefined {
    const selectedConfig = this.selected();
    if (!selectedConfig) return undefined;
    return this.leagueFor(selectedConfig.externalId);
  }

  selectedDeck(): Deck | undefined {
    const selectedConfig = this.selected();
    if (!selectedConfig) return undefined;
    return this.deckForLeague(selectedConfig.externalId);
  }

  async selectLeague(config: LeagueImportConfig) {
    if (config.comingSoon) {
      this.error.set(`${config.name} em breve.`);
      return;
    }

    this.error.set(null);

    if (this.deckForLeague(config.externalId)) {
      this.selected.set(config);
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

      this.selected.set(config);
      void this.refreshDecks();
    } catch {
      this.selected.set(null);
      this.error.set('Falha ao importar. Tente novamente.');
    } finally {
      this.importingId.set(null);
    }
  }

  private async refreshDecks() {
    this.decks.set(await this.deckService.listDecks());
    await this.refreshLeagues();
  }

  private async refreshLeagues() {
    const entries = await Promise.all(
      this.leagueConfigs.map(async config => {
        const leagueId = `ts-${config.externalId}`;
        return [leagueId, await this.leagueService.getLeague(leagueId)] as const;
      }),
    );
    const map = new Map<string, League>();
    for (const [leagueId, league] of entries) {
      if (league) map.set(leagueId, league);
    }
    this.leagues.set(map);
  }
}
```

Create `src/app/features/league-picker/league-picker.html`:

```html
<header class="app-header">
  <div class="app-header__side">
    <a routerLink="/" class="icon-btn" aria-label="Início">
      <hugeicons-icon [icon]="Home01Icon" [size]="20" [strokeWidth]="1.8" color="currentColor" />
    </a>
  </div>
  <div class="app-header__title">{{ title() }}</div>
  <div class="app-header__side"></div>
</header>

<main class="screen">
  @if (error()) {
    <p class="alert" role="alert">{{ error() }}</p>
  }

  <section aria-label="Ligas disponíveis">
    <div class="section-header">
      <p class="eyebrow">{{ selected() ? 'Liga selecionada' : (selectedCountry() ? 'Selecione uma liga/torneio' : 'Selecione um país') }}</p>
      @if (selectedCountry() && !selected()) {
        <button type="button" class="section-header__back" (click)="backToCountries()">
          <hugeicons-icon [icon]="Exchange01Icon" [size]="16" [strokeWidth]="1.8" color="currentColor" />
          Trocar país
        </button>
      }
      @if (selected()) {
        <button type="button" class="section-header__back" (click)="backToLeagues()">
          <hugeicons-icon [icon]="Exchange01Icon" [size]="16" [strokeWidth]="1.8" color="currentColor" />
          Trocar liga
        </button>
      }
    </div>

    @if (!selectedCountry()) {
      <div class="league-list league-list--countries">
        @for (country of countryOptions(); track country.name) {
          <button
            type="button"
            class="card league-card league-card--selectable league-card--country"
            data-testid="select-country"
            (click)="selectCountry(country.name)"
          >
            <span class="league-card__flag" [attr.aria-label]="country.name">{{ country.flag }}</span>
            <div class="league-card__info">
              <p class="league-card__name">{{ country.name }}</p>
              <p class="league-card__meta">{{ country.count }} {{ country.count === 1 ? 'torneio' : 'torneios' }}</p>
            </div>
          </button>
        }
      </div>
    } @else if (!selected()) {
      <div class="league-list league-list--single-column">
        @for (config of leaguesForCountry(selectedCountry()!); track config.externalId) {
          @let leagueDeck = deckForLeague(config.externalId);
          <button
            type="button"
            class="card league-card league-card--selectable"
            data-testid="select-league"
            [disabled]="importingId() === config.externalId"
            (click)="selectLeague(config)"
          >
            <div class="league-card__header">
              @if (leagueFor(config.externalId); as league) {
                <span class="league-card__badge">
                  <app-league-badge [league]="league" />
                </span>
              }
              <div class="league-card__info">
                <p class="league-card__name">{{ config.name }}</p>
                <p class="league-card__meta">{{ config.country }}</p>
              </div>
              <span class="league-card__flag" [attr.aria-label]="config.country">{{ countryFlag(config.country) }}</span>
            </div>
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
          </button>
        }
      </div>
    } @else {
      @let selectedConfig = selected()!;
      <article class="card league-card league-card--selected">
        <div class="league-card__header">
          @if (selectedLeague(); as league) {
            <span class="league-card__badge">
              <app-league-badge [league]="league" />
            </span>
          }
          <div class="league-card__info">
            <p class="league-card__name">{{ selectedConfig.name }}</p>
            <p class="league-card__meta">{{ selectedConfig.country }}</p>
          </div>
          <span class="league-card__flag" [attr.aria-label]="selectedConfig.country">{{ countryFlag(selectedConfig.country) }}</span>
        </div>

        @if (selectedDeck(); as deck) {
          <div class="league-card__actions">
            @if (showsAction('study')) {
              <a class="deck-row" data-testid="study-link" [routerLink]="['/study', deck.id]">
                <span class="deck-row__icon deck-row__icon--green">
                  <hugeicons-icon [icon]="Book01Icon" [size]="18" [strokeWidth]="1.8" color="currentColor" />
                </span>
                <span class="deck-row__text">
                  <span class="deck-row__title">Estudar</span>
                  <span class="deck-row__subtitle">{{ deck.teamIds.length }} times · revisão espaçada</span>
                </span>
                <span class="deck-row__chevron">›</span>
              </a>
            }

            @if (showsAction('play')) {
              <a class="deck-row" data-testid="game-link" [routerLink]="['/game', deck.id]">
                <span class="deck-row__icon deck-row__icon--blue">
                  <hugeicons-icon [icon]="Quiz01Icon" [size]="18" [strokeWidth]="1.8" color="currentColor" />
                </span>
                <span class="deck-row__text">
                  <span class="deck-row__title">Múltipla escolha</span>
                  <span class="deck-row__subtitle">Jogar agora</span>
                </span>
                <span class="deck-row__chevron">›</span>
              </a>
            }

            @if (showsAction('reverse')) {
              <a class="deck-row" data-testid="reverse-link" [routerLink]="['/game', deck.id]" [queryParams]="{ mode: 'reverse' }">
                <span class="deck-row__icon deck-row__icon--purple">
                  <hugeicons-icon [icon]="Quiz01Icon" [size]="18" [strokeWidth]="1.8" color="currentColor" />
                </span>
                <span class="deck-row__text">
                  <span class="deck-row__title">Reverso</span>
                  <span class="deck-row__subtitle">Escolha o escudo</span>
                </span>
                <span class="deck-row__chevron">›</span>
              </a>
            }
          </div>
        } @else if (importingId() === selectedConfig.externalId) {
          <p class="league-card__status">Estamos preparando seu baralho para você começar.</p>
        } @else {
          <p class="league-card__status">Selecione novamente para importar esta liga.</p>
        }
      </article>
    }
  </section>
</main>
```

- [x] **Step 5: Run it to confirm it passes**

Run: `npx ng test --include='src/app/features/league-picker/league-picker.spec.ts' --watch=false`
Expected: PASS

- [x] **Step 6: Wire the routes**

Update `src/app/app.routes.ts`:

```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then(m => m.Home),
  },
  {
    path: 'estudo',
    loadComponent: () => import('./features/league-picker/league-picker').then(m => m.LeaguePicker),
    data: { actions: ['study'], title: 'Estudo' },
  },
  {
    path: 'jogos',
    loadComponent: () => import('./features/league-picker/league-picker').then(m => m.LeaguePicker),
    data: { actions: ['play', 'reverse'], title: 'Jogos' },
  },
  {
    path: 'study/:deckId',
    loadComponent: () => import('./features/study/study').then(m => m.Study),
  },
  {
    path: 'game/:deckId',
    loadComponent: () => import('./features/game/game').then(m => m.Game),
  },
  {
    path: 'stats',
    loadComponent: () => import('./features/stats/stats').then(m => m.Stats),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then(m => m.Settings),
  },
];
```

Update `src/app/app.routes.spec.ts`:

```typescript
import { routes } from './app.routes';

describe('routes', () => {
  it('defines the home, estudo, jogos, study, game, stats, and settings routes', () => {
    const paths = routes.map(route => route.path);
    expect(paths).toEqual(['', 'estudo', 'jogos', 'study/:deckId', 'game/:deckId', 'stats', 'settings']);
  });
});
```

- [x] **Step 7: Run the full unit test suite**

Run: `npx ng test --watch=false`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/styles.scss src/app/features/league-picker src/app/app.routes.ts src/app/app.routes.spec.ts
git commit -m "feat: add LeaguePicker component and wire /estudo, /jogos routes"
```

---

## Task 6: `Search` feature (`/pesquisa`)

**Files:**
- Create: `src/app/features/search/search.ts`
- Create: `src/app/features/search/search.html`
- Create: `src/app/features/search/search.scss`
- Test: `src/app/features/search/search.spec.ts`

**Interfaces:**
- Consumes: `countryOptions`/`leaguesForCountry`/`countryFlag` (Task 2), `TeamService.getTeam`/`searchByName` (Task 3), existing `DeckService.listDecks`, `LeagueService.getLeague`.
- Produces: `Search` component, routed at `/pesquisa` (wired in Task 8 alongside the Home rewrite, since both touch `app.routes.ts`'s remaining gap).

- [x] **Step 1: Write the failing test**

```typescript
import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Search } from './search';
import { DeckService } from '../../core/decks/deck.service';
import { LeagueService } from '../../core/leagues/league.service';
import { TeamService } from '../../core/leagues/team.service';
import { Deck } from '../../core/models/deck.model';
import { Team } from '../../core/models/team.model';

describe('Search', () => {
  let fixture: ComponentFixture<Search>;
  let deckServiceSpy: { listDecks: ReturnType<typeof vi.fn> };
  let leagueServiceSpy: { getLeague: ReturnType<typeof vi.fn> };
  let teamServiceSpy: { getTeam: ReturnType<typeof vi.fn>; searchByName: ReturnType<typeof vi.fn> };

  const arsenal: Team = {
    id: 'ts-4328-1',
    externalIds: {},
    name: 'Arsenal',
    alternateNames: ['The Gunners'],
    country: 'Inglaterra',
    leagueIds: ['ts-4328'],
    badgeUrl: 'https://example.com/arsenal.png',
    founded: 1886,
  };

  const premierLeagueDeck: Deck = {
    id: 'deck-league-ts-4328',
    name: 'Premier League',
    scope: { kind: 'league', leagueId: 'ts-4328' },
    teamIds: ['ts-4328-1'],
    createdAt: new Date().toISOString(),
  };

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    deckServiceSpy = { listDecks: vi.fn().mockResolvedValue([premierLeagueDeck]) };
    leagueServiceSpy = { getLeague: vi.fn().mockResolvedValue(undefined) };
    teamServiceSpy = {
      getTeam: vi.fn().mockResolvedValue(arsenal),
      searchByName: vi.fn().mockResolvedValue([arsenal]),
    };

    await TestBed.configureTestingModule({
      imports: [Search],
      providers: [
        provideRouter([]),
        { provide: DeckService, useValue: deckServiceSpy },
        { provide: LeagueService, useValue: leagueServiceSpy },
        { provide: TeamService, useValue: teamServiceSpy },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Search);
  });

  it('shows country cards by default', async () => {
    await settle();
    const countryButton = fixture.nativeElement.querySelector('[data-testid="select-country"]');
    expect(countryButton).toBeTruthy();
    expect(countryButton.textContent).toContain('Inglaterra');
  });

  it('typing a team name filters down to leagues containing a match', async () => {
    await settle();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="search-input"]');
    input.value = 'Arsenal';
    input.dispatchEvent(new Event('input'));
    await settle();

    expect(teamServiceSpy.searchByName).toHaveBeenCalledWith('Arsenal');
    const leagueButton = fixture.nativeElement.querySelector('[data-testid="select-league"]');
    expect(leagueButton).toBeTruthy();
    expect(leagueButton.textContent).toContain('Premier League');
  });

  it('drills down from country to league to a 3-column team grid', async () => {
    await settle();

    fixture.nativeElement.querySelector('[data-testid="select-country"]').click();
    await settle();
    fixture.nativeElement.querySelector('[data-testid="select-league"]').click();
    await settle();

    expect(teamServiceSpy.getTeam).toHaveBeenCalledWith('ts-4328-1');
    const teamButton = fixture.nativeElement.querySelector('[data-testid="select-team"]');
    expect(teamButton).toBeTruthy();
    expect(teamButton.textContent).toContain('Arsenal');
  });

  it('shows team details including calculated age', async () => {
    vi.setSystemTime(new Date('2026-01-01'));
    await settle();

    fixture.nativeElement.querySelector('[data-testid="select-country"]').click();
    await settle();
    fixture.nativeElement.querySelector('[data-testid="select-league"]').click();
    await settle();
    fixture.nativeElement.querySelector('[data-testid="select-team"]').click();
    await settle();

    const detail = fixture.nativeElement.querySelector('[data-testid="team-detail"]');
    expect(detail.textContent).toContain('Arsenal');
    expect(detail.textContent).toContain('1886');
    expect(detail.textContent).toContain('140 anos');

    vi.useRealTimers();
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `npx ng test --include='src/app/features/search/search.spec.ts' --watch=false`
Expected: FAIL — `search.ts` doesn't exist yet.

- [x] **Step 3: Implement `Search`**

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { Home01Icon, Search01Icon, Exchange01Icon } from '@hugeicons/core-free-icons';
import { DeckService } from '../../core/decks/deck.service';
import { LeagueService } from '../../core/leagues/league.service';
import { TeamService } from '../../core/leagues/team.service';
import { countryOptions, leaguesForCountry, countryFlag, CountryOption } from '../../core/leagues/league-catalog';
import { LEAGUES_TO_IMPORT, LeagueImportConfig } from '../../core/data/league-import.config';
import { Deck } from '../../core/models/deck.model';
import { League } from '../../core/models/league.model';
import { Team } from '../../core/models/team.model';
import { LeagueBadge } from '../../shared/ui/league-badge';
import { TeamBadge } from '../../shared/ui/team-badge';

// comingSoon leagues have no real teams to browse (some don't even have a
// numeric TheSportsDB id), so Pesquisa excludes them entirely.
const SEARCHABLE_LEAGUES = LEAGUES_TO_IMPORT.filter(config => !config.comingSoon);

@Component({
  selector: 'app-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HugeiconsIconComponent, LeagueBadge, TeamBadge],
  templateUrl: './search.html',
  styleUrl: './search.scss',
})
export class Search {
  private deckService = inject(DeckService);
  private leagueService = inject(LeagueService);
  private teamService = inject(TeamService);
  private route = inject(ActivatedRoute);

  readonly Home01Icon = Home01Icon;
  readonly Search01Icon = Search01Icon;
  readonly Exchange01Icon = Exchange01Icon;

  readonly query = signal('');
  readonly matchedLeagues = signal<LeagueImportConfig[] | null>(null);
  readonly selectedCountry = signal<string | null>(null);
  readonly selectedLeagueConfig = signal<LeagueImportConfig | null>(null);
  readonly leagueTeams = signal<Team[]>([]);
  readonly selectedTeam = signal<Team | null>(null);
  readonly leagues = signal<Map<string, League>>(new Map());
  readonly decks = signal<Deck[]>([]);

  constructor() {
    this.refreshCatalog();
    void this.restoreFromQueryParams();
  }

  private async refreshCatalog() {
    this.decks.set(await this.deckService.listDecks());
    const entries = await Promise.all(
      SEARCHABLE_LEAGUES.map(async config => {
        const league = await this.leagueService.getLeague(`ts-${config.externalId}`);
        return [config.externalId, league] as const;
      }),
    );
    this.leagues.set(new Map(entries.filter((entry): entry is [string, League] => !!entry[1])));
  }

  private async restoreFromQueryParams() {
    const leagueExternalId = this.route.snapshot.queryParamMap.get('league');
    const teamId = this.route.snapshot.queryParamMap.get('team');
    if (!leagueExternalId) return;

    const config = SEARCHABLE_LEAGUES.find(c => c.externalId === leagueExternalId);
    if (!config) return;

    this.selectedCountry.set(config.country);
    await this.openLeague(config);

    if (teamId) {
      const team = this.leagueTeams().find(t => t.id === teamId);
      if (team) this.selectedTeam.set(team);
    }
  }

  countryOptions(): CountryOption[] {
    return countryOptions(SEARCHABLE_LEAGUES);
  }

  leaguesForCountry(country: string): LeagueImportConfig[] {
    return leaguesForCountry(SEARCHABLE_LEAGUES, country);
  }

  countryFlag(country: string): string {
    return countryFlag(country);
  }

  leagueFor(externalId: string): League | undefined {
    return this.leagues().get(`ts-${externalId}`);
  }

  async onQueryChange(value: string) {
    this.query.set(value);
    const trimmed = value.trim();
    if (!trimmed) {
      this.matchedLeagues.set(null);
      return;
    }

    const matches = await this.teamService.searchByName(trimmed);
    const matchedTeamIds = new Set(matches.map(team => team.id));
    const decks = this.decks();
    const matchedLeagues = SEARCHABLE_LEAGUES.filter(config => {
      const deck = decks.find(d => d.scope.kind === 'league' && d.scope.leagueId === `ts-${config.externalId}`);
      return !!deck && deck.teamIds.some(id => matchedTeamIds.has(id));
    });
    this.matchedLeagues.set(matchedLeagues);
  }

  selectCountry(country: string) {
    this.selectedCountry.set(country);
    this.selectedLeagueConfig.set(null);
    this.selectedTeam.set(null);
  }

  backToCountries() {
    this.selectedCountry.set(null);
    this.selectedLeagueConfig.set(null);
    this.selectedTeam.set(null);
  }

  backToLeagues() {
    this.selectedLeagueConfig.set(null);
    this.leagueTeams.set([]);
    this.selectedTeam.set(null);
  }

  backToTeams() {
    this.selectedTeam.set(null);
  }

  async openLeague(config: LeagueImportConfig) {
    this.selectedLeagueConfig.set(config);
    const deck = this.decks().find(d => d.scope.kind === 'league' && d.scope.leagueId === `ts-${config.externalId}`);
    const teamIds = deck?.teamIds ?? [];
    const teams = await Promise.all(teamIds.map(id => this.teamService.getTeam(id)));
    this.leagueTeams.set(teams.filter((team): team is Team => !!team));
  }

  selectTeam(team: Team) {
    this.selectedTeam.set(team);
  }

  teamAge(team: Team): number | null {
    if (!team.founded) return null;
    return new Date().getFullYear() - team.founded;
  }

  leagueNamesFor(team: Team): string[] {
    return team.leagueIds
      .map(id => SEARCHABLE_LEAGUES.find(c => `ts-${c.externalId}` === id)?.name)
      .filter((name): name is string => !!name);
  }
}
```

Create `src/app/features/search/search.html`:

```html
<header class="app-header">
  <div class="app-header__side">
    <a routerLink="/" class="icon-btn" aria-label="Início">
      <hugeicons-icon [icon]="Home01Icon" [size]="20" [strokeWidth]="1.8" color="currentColor" />
    </a>
  </div>
  <div class="app-header__title">Pesquisa</div>
  <div class="app-header__side"></div>
</header>

<main class="screen">
  <div class="search-bar">
    <hugeicons-icon [icon]="Search01Icon" [size]="18" [strokeWidth]="1.8" color="currentColor" />
    <input
      type="search"
      class="search-bar__input"
      placeholder="Buscar time..."
      data-testid="search-input"
      [value]="query()"
      (input)="onQueryChange($any($event.target).value)"
    />
  </div>

  @if (query().trim()) {
    <section aria-label="Resultado da busca">
      <p class="eyebrow">Ligas com "{{ query() }}"</p>
      @if (matchedLeagues() && matchedLeagues()!.length === 0) {
        <p class="league-card__status">Nenhum time encontrado.</p>
      } @else {
        <div class="league-list league-list--single-column">
          @for (config of matchedLeagues(); track config.externalId) {
            <button type="button" class="card league-card league-card--selectable" data-testid="select-league" (click)="openLeague(config)">
              <div class="league-card__header">
                @if (leagueFor(config.externalId); as league) {
                  <span class="league-card__badge"><app-league-badge [league]="league" /></span>
                }
                <div class="league-card__info">
                  <p class="league-card__name">{{ config.name }}</p>
                  <p class="league-card__meta">{{ config.country }}</p>
                </div>
                <span class="league-card__flag" [attr.aria-label]="config.country">{{ countryFlag(config.country) }}</span>
              </div>
            </button>
          }
        </div>
      }
    </section>
  } @else if (selectedTeam(); as team) {
    <section aria-label="Detalhe do time">
      <button type="button" class="section-header__back" (click)="backToTeams()">
        <hugeicons-icon [icon]="Exchange01Icon" [size]="16" [strokeWidth]="1.8" color="currentColor" />
        Voltar aos times
      </button>

      <article class="card team-detail" data-testid="team-detail">
        <span class="team-detail__badge"><app-team-badge [team]="team" /></span>
        <h2 class="team-detail__name">{{ team.name }}</h2>
        @if (team.shortName) {
          <p class="team-detail__meta">{{ team.shortName }}</p>
        }
        <dl class="team-detail__facts">
          <div>
            <dt>País</dt>
            <dd>{{ team.country }}</dd>
          </div>
          @if (team.founded) {
            <div>
              <dt>Fundação</dt>
              <dd>{{ team.founded }} ({{ teamAge(team) }} anos)</dd>
            </div>
          }
          @if (leagueNamesFor(team).length) {
            <div>
              <dt>Liga(s)</dt>
              <dd>{{ leagueNamesFor(team).join(', ') }}</dd>
            </div>
          }
          @if (team.alternateNames.length) {
            <div>
              <dt>Também conhecido como</dt>
              <dd>{{ team.alternateNames.join(', ') }}</dd>
            </div>
          }
        </dl>
      </article>
    </section>
  } @else if (selectedLeagueConfig(); as config) {
    <section aria-label="Times da liga">
      <div class="section-header">
        <p class="eyebrow">{{ config.name }}</p>
        <button type="button" class="section-header__back" (click)="backToLeagues()">
          <hugeicons-icon [icon]="Exchange01Icon" [size]="16" [strokeWidth]="1.8" color="currentColor" />
          Trocar liga
        </button>
      </div>

      <div class="team-grid">
        @for (team of leagueTeams(); track team.id) {
          <button type="button" class="team-grid__item" data-testid="select-team" (click)="selectTeam(team)">
            <span class="team-grid__badge"><app-team-badge [team]="team" /></span>
            <span class="team-grid__name">{{ team.name }}</span>
          </button>
        }
      </div>
    </section>
  } @else if (selectedCountry(); as country) {
    <section aria-label="Ligas do país">
      <div class="section-header">
        <p class="eyebrow">{{ country }}</p>
        <button type="button" class="section-header__back" (click)="backToCountries()">
          <hugeicons-icon [icon]="Exchange01Icon" [size]="16" [strokeWidth]="1.8" color="currentColor" />
          Trocar país
        </button>
      </div>

      <div class="league-list league-list--single-column">
        @for (config of leaguesForCountry(country); track config.externalId) {
          <button type="button" class="card league-card league-card--selectable" data-testid="select-league" (click)="openLeague(config)">
            <div class="league-card__header">
              @if (leagueFor(config.externalId); as league) {
                <span class="league-card__badge"><app-league-badge [league]="league" /></span>
              }
              <div class="league-card__info">
                <p class="league-card__name">{{ config.name }}</p>
                <p class="league-card__meta">{{ config.country }}</p>
              </div>
            </div>
          </button>
        }
      </div>
    </section>
  } @else {
    <section aria-label="Países">
      <p class="eyebrow">Selecione um país</p>
      <div class="league-list league-list--countries">
        @for (country of countryOptions(); track country.name) {
          <button type="button" class="card league-card league-card--selectable league-card--country" data-testid="select-country" (click)="selectCountry(country.name)">
            <span class="league-card__flag" [attr.aria-label]="country.name">{{ country.flag }}</span>
            <div class="league-card__info">
              <p class="league-card__name">{{ country.name }}</p>
              <p class="league-card__meta">{{ country.count }} {{ country.count === 1 ? 'torneio' : 'torneios' }}</p>
            </div>
          </button>
        }
      </div>
    </section>
  }
</main>
```

Create `src/app/features/search/search.scss`:

```scss
.search-bar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.search-bar__input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 0.95rem;
  outline: none;

  &::placeholder {
    color: var(--text-muted);
  }
}

.team-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.team-grid__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  text-align: center;

  &:hover {
    border-color: var(--green);
  }
}

.team-grid__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-sm);
  background: var(--badge-chip-bg);
  overflow: hidden;

  app-team-badge {
    display: block;
    width: 100%;
    height: 100%;
  }
}

.team-grid__name {
  font-size: 0.75rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.team-detail {
  padding: 1.5rem 1.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
}

.team-detail__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 5rem;
  height: 5rem;
  border-radius: var(--radius-md);
  background: var(--badge-chip-bg);
  overflow: hidden;
  margin-bottom: 0.5rem;

  app-team-badge {
    display: block;
    width: 100%;
    height: 100%;
  }
}

.team-detail__name {
  font-size: 1.2rem;
  font-weight: 700;
}

.team-detail__meta {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.team-detail__facts {
  width: 100%;
  margin: 1rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  text-align: left;

  div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--border);
  }

  dt {
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  dd {
    margin: 0;
    font-weight: 600;
    font-size: 0.85rem;
    text-align: right;
  }
}
```

- [x] **Step 4: Run it to confirm it passes**

Run: `npx ng test --include='src/app/features/search/search.spec.ts' --watch=false`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/features/search
git commit -m "feat: add Search feature (país→liga→times→detalhe do time)"
```

---

## Task 7: New Home (4-card menu) + wire `/pesquisa`

**Files:**
- Modify: `src/app/features/home/home.ts`
- Modify: `src/app/features/home/home.html`
- Modify: `src/app/features/home/home.scss`
- Modify: `src/app/features/home/home.spec.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/app.routes.spec.ts`

**Interfaces:**
- Produces: `Home` component with a plain `cards: HomeCard[]` array (no signals needed — static data), linking to `/estudo`, `/jogos`, `/stats`, `/pesquisa`.

- [x] **Step 1: Write the failing test**

Replace `src/app/features/home/home.spec.ts` with:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Home } from './home';

describe('Home', () => {
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
  });

  it('shows a card linking to each main section', () => {
    for (const testId of ['home-estudo', 'home-jogos', 'home-stats', 'home-pesquisa']) {
      expect(fixture.nativeElement.querySelector(`[data-testid="${testId}"]`)).toBeTruthy();
    }
  });

  it('always shows an enabled link to settings', () => {
    const settingsLink: HTMLAnchorElement = fixture.nativeElement.querySelector('[data-testid="settings-link"]');
    expect(settingsLink).toBeTruthy();
    expect(settingsLink.hasAttribute('disabled')).toBe(false);
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `npx ng test --include='src/app/features/home/home.spec.ts' --watch=false`
Expected: FAIL — the current `Home` still renders the país/liga picker, not these test ids.

- [x] **Step 3: Rewrite `Home`**

Replace `src/app/features/home/home.ts`:

```typescript
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  Home01Icon,
  Settings01Icon,
  Book01Icon,
  Quiz01Icon,
  ChartColumnIncreasingIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';

interface HomeCard {
  routerLink: string;
  icon: typeof Book01Icon;
  title: string;
  subtitle: string;
  testId: string;
}

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HugeiconsIconComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  readonly Home01Icon = Home01Icon;
  readonly Settings01Icon = Settings01Icon;

  readonly cards: HomeCard[] = [
    { routerLink: '/estudo', icon: Book01Icon, title: 'Estudo', subtitle: 'Revisão espaçada', testId: 'home-estudo' },
    { routerLink: '/jogos', icon: Quiz01Icon, title: 'Jogos', subtitle: 'Múltipla escolha e reverso', testId: 'home-jogos' },
    { routerLink: '/stats', icon: ChartColumnIncreasingIcon, title: 'Stats', subtitle: 'Seu progresso', testId: 'home-stats' },
    { routerLink: '/pesquisa', icon: Search01Icon, title: 'Pesquisa', subtitle: 'Times e ligas', testId: 'home-pesquisa' },
  ];
}
```

Replace `src/app/features/home/home.html`:

```html
<header class="app-header">
  <div class="app-header__title">
    <span class="brand-mark">
      <hugeicons-icon [icon]="Home01Icon" [size]="22" [strokeWidth]="1.8" color="currentColor" />
    </span>
    <div>
      <p>Escudos</p>
      <p class="brand-subtitle">Flashcards</p>
    </div>
  </div>
  <a routerLink="/settings" class="icon-btn" aria-label="Configurações" data-testid="settings-link">
    <hugeicons-icon [icon]="Settings01Icon" [size]="20" [strokeWidth]="1.8" color="currentColor" />
  </a>
</header>

<main class="screen">
  <div class="home-grid">
    @for (card of cards; track card.routerLink) {
      <a [routerLink]="card.routerLink" class="card home-card" [attr.data-testid]="card.testId">
        <span class="home-card__icon">
          <hugeicons-icon [icon]="card.icon" [size]="24" [strokeWidth]="1.8" color="currentColor" />
        </span>
        <p class="home-card__title">{{ card.title }}</p>
        <p class="home-card__subtitle">{{ card.subtitle }}</p>
      </a>
    }
  </div>
</main>
```

Replace `src/app/features/home/home.scss` (drops the país/liga/deck-row rules now that they live in `styles.scss`, per Task 5's copy):

```scss
.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  background: var(--green-dim);
  color: var(--green);
}

.app-header__title {
  p:first-child {
    font-size: 1.05rem;
  }
}

.brand-subtitle {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted);
}

.home-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.home-card {
  padding: 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  border: 1px solid transparent;
  transition: transform 0.15s ease, border-color 0.15s ease;

  &:hover {
    border-color: var(--green);
    transform: translateY(-2px);
  }
}

.home-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  background: var(--green-dim);
  color: var(--green);
}

.home-card__title {
  font-weight: 700;
  font-size: 1rem;
}

.home-card__subtitle {
  font-size: 0.8rem;
  color: var(--text-muted);
}
```

- [x] **Step 4: Run it to confirm it passes**

Run: `npx ng test --include='src/app/features/home/home.spec.ts' --watch=false`
Expected: PASS

- [x] **Step 5: Wire `/pesquisa`**

Add to `src/app/app.routes.ts`, right after the `jogos` route:

```typescript
  {
    path: 'pesquisa',
    loadComponent: () => import('./features/search/search').then(m => m.Search),
  },
```

Update `src/app/app.routes.spec.ts`:

```typescript
import { routes } from './app.routes';

describe('routes', () => {
  it('defines the home, estudo, jogos, pesquisa, study, game, stats, and settings routes', () => {
    const paths = routes.map(route => route.path);
    expect(paths).toEqual(['', 'estudo', 'jogos', 'pesquisa', 'study/:deckId', 'game/:deckId', 'stats', 'settings']);
  });
});
```

- [x] **Step 6: Run the full unit test suite**

Run: `npx ng test --watch=false`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/features/home src/app/app.routes.ts src/app/app.routes.spec.ts
git commit -m "feat: rewrite Home as a 4-card menu and wire /pesquisa"
```

---

## Task 8: `AppInitService` + blocking splash on boot

**Files:**
- Create: `src/app/core/data/app-init.service.ts`
- Test: `src/app/core/data/app-init.service.spec.ts`
- Modify: `src/app/app.ts`
- Modify: `src/app/app.html`
- Modify: `src/app/app.scss`
- Modify: `src/app/app.spec.ts`

**Interfaces:**
- Consumes: existing `ImportService.importLeague`, `DeckService.createLeagueDeck`/`getDeck`, `LeagueService.getLeague`, `DbService.teams`; `warmImageCache` from Task 4.
- Produces: `AppInitService.stage: Signal<AppInitStage>`, `AppInitService.run(): Promise<void>`, `AppInitStage = { kind: 'importing'; done: number; total: number } | { kind: 'warming-badges'; done: number; total: number } | { kind: 'ready' }`.

- [x] **Step 1: Write the failing test**

```typescript
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AppInitService } from './app-init.service';
import { ImportService } from './import.service';
import { DeckService } from '../decks/deck.service';
import { LeagueService } from '../leagues/league.service';
import { DbService } from '../persistence/db.service';
import { League } from '../models/league.model';
import { Deck } from '../models/deck.model';
import * as badgeWarmer from '../persistence/badge-warmer';

vi.mock('../persistence/badge-warmer', () => ({
  warmImageCache: vi.fn().mockResolvedValue(undefined),
}));

describe('AppInitService', () => {
  let service: AppInitService;
  let importServiceSpy: { importLeague: ReturnType<typeof vi.fn> };
  let deckServiceSpy: { createLeagueDeck: ReturnType<typeof vi.fn>; getDeck: ReturnType<typeof vi.fn> };
  let leagueServiceSpy: { getLeague: ReturnType<typeof vi.fn> };
  let dbSpy: { teams: { toArray: ReturnType<typeof vi.fn> } };

  const readyLeague: League = {
    id: 'ts-4328',
    externalIds: {},
    name: 'Premier League',
    country: 'Inglaterra',
    regionId: 'europe',
    sport: 'soccer',
    badgeUrl: 'https://example.com/pl.png',
  };
  const readyDeck: Deck = {
    id: 'deck-league-ts-4328',
    name: 'Premier League',
    scope: { kind: 'league', leagueId: 'ts-4328' },
    teamIds: ['ts-4328-1'],
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    importServiceSpy = { importLeague: vi.fn() };
    deckServiceSpy = { createLeagueDeck: vi.fn(), getDeck: vi.fn() };
    leagueServiceSpy = { getLeague: vi.fn() };
    dbSpy = { teams: { toArray: vi.fn().mockResolvedValue([]) } };

    TestBed.configureTestingModule({
      providers: [
        { provide: ImportService, useValue: importServiceSpy },
        { provide: DeckService, useValue: deckServiceSpy },
        { provide: LeagueService, useValue: leagueServiceSpy },
        { provide: DbService, useValue: dbSpy },
      ],
    });
    service = TestBed.inject(AppInitService);
    vi.mocked(badgeWarmer.warmImageCache).mockClear();
  });

  it('goes straight to ready when every league already has a league and a deck with teams', async () => {
    leagueServiceSpy.getLeague.mockResolvedValue(readyLeague);
    deckServiceSpy.getDeck.mockResolvedValue(readyDeck);

    await service.run();

    expect(importServiceSpy.importLeague).not.toHaveBeenCalled();
    expect(service.stage()).toEqual({ kind: 'ready' });
  });

  it('imports only the leagues missing a league/deck', async () => {
    leagueServiceSpy.getLeague.mockImplementation((id: string) =>
      Promise.resolve(id === 'ts-4328' ? readyLeague : undefined),
    );
    deckServiceSpy.getDeck.mockImplementation((id: string) =>
      Promise.resolve(id === 'deck-league-ts-4328' ? readyDeck : undefined),
    );
    importServiceSpy.importLeague.mockResolvedValue(readyLeague);
    deckServiceSpy.createLeagueDeck.mockResolvedValue(readyDeck);

    await service.run();

    expect(importServiceSpy.importLeague.mock.calls.length).toBeGreaterThan(0);
    expect(importServiceSpy.importLeague).not.toHaveBeenCalledWith(
      expect.objectContaining({ externalId: '4328' }),
    );
    expect(service.stage()).toEqual({ kind: 'ready' });
  });

  it('warms the badge cache for every imported league and its teams after importing', async () => {
    leagueServiceSpy.getLeague.mockResolvedValue(undefined);
    deckServiceSpy.getDeck.mockResolvedValue(undefined);
    importServiceSpy.importLeague.mockResolvedValue(readyLeague);
    deckServiceSpy.createLeagueDeck.mockResolvedValue(readyDeck);
    dbSpy.teams.toArray.mockResolvedValue([{ id: 'ts-4328-1', badgeUrl: 'https://example.com/arsenal.png' }]);

    await service.run();

    expect(badgeWarmer.warmImageCache).toHaveBeenCalled();
    const [urls] = vi.mocked(badgeWarmer.warmImageCache).mock.calls[0];
    expect(urls).toContain('https://example.com/arsenal.png');
    expect(urls).toContain('https://example.com/pl.png');
  });

  it('never warms badges when everything was already ready', async () => {
    leagueServiceSpy.getLeague.mockResolvedValue(readyLeague);
    deckServiceSpy.getDeck.mockResolvedValue(readyDeck);

    await service.run();

    expect(badgeWarmer.warmImageCache).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `npx ng test --include='src/app/core/data/app-init.service.spec.ts' --watch=false`
Expected: FAIL — `app-init.service.ts` doesn't exist yet.

- [x] **Step 3: Implement `AppInitService`**

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { ImportService } from './import.service';
import { DeckService } from '../decks/deck.service';
import { LeagueService } from '../leagues/league.service';
import { LEAGUES_TO_IMPORT, LeagueImportConfig } from './league-import.config';
import { warmImageCache } from '../persistence/badge-warmer';
import { DbService } from '../persistence/db.service';
import { League } from '../models/league.model';

export type AppInitStage =
  | { kind: 'importing'; done: number; total: number }
  | { kind: 'warming-badges'; done: number; total: number }
  | { kind: 'ready' };

@Injectable({ providedIn: 'root' })
export class AppInitService {
  private importService = inject(ImportService);
  private deckService = inject(DeckService);
  private leagueService = inject(LeagueService);
  private db = inject(DbService);

  readonly stage = signal<AppInitStage>({ kind: 'importing', done: 0, total: 0 });

  // comingSoon leagues (Copa do Mundo etc.) are placeholders with no importable
  // data, so they never take part in the boot-time import.
  private readonly leaguesToImport = LEAGUES_TO_IMPORT.filter(config => !config.comingSoon);

  async run(): Promise<void> {
    const missing = await this.findMissingLeagues();

    if (missing.length > 0) {
      this.stage.set({ kind: 'importing', done: 0, total: missing.length });
      const importedLeagues: League[] = [];
      for (const [index, config] of missing.entries()) {
        const league = await this.importService.importLeague(config);
        await this.deckService.createLeagueDeck(league);
        importedLeagues.push(league);
        this.stage.set({ kind: 'importing', done: index + 1, total: missing.length });
      }

      await this.warmBadges(importedLeagues);
    }

    this.stage.set({ kind: 'ready' });
  }

  private async findMissingLeagues(): Promise<LeagueImportConfig[]> {
    const results = await Promise.all(
      this.leaguesToImport.map(async config => ((await this.isLeagueReady(config)) ? null : config)),
    );
    return results.filter((config): config is LeagueImportConfig => !!config);
  }

  private async isLeagueReady(config: LeagueImportConfig): Promise<boolean> {
    const leagueId = `ts-${config.externalId}`;
    const league = await this.leagueService.getLeague(leagueId);
    if (!league) return false;
    const deck = await this.deckService.getDeck(`deck-league-${leagueId}`);
    return !!deck && deck.teamIds.length > 0;
  }

  // Not routed through BadgeCacheService: that service tries to fetch each
  // badge as a blob for IndexedDB storage, which fails for effectively every
  // TheSportsDB badge because their CDN sends no CORS header. warmImageCache
  // just lets the browser's own HTTP cache absorb the response instead.
  private async warmBadges(importedLeagues: League[]): Promise<void> {
    const allTeams = await this.db.teams.toArray();
    const leagueBadgeUrls = importedLeagues.map(league => league.badgeUrl).filter((url): url is string => !!url);
    const teamBadgeUrls = allTeams.map(team => team.badgeUrl).filter(Boolean);
    const urls = [...leagueBadgeUrls, ...teamBadgeUrls];

    this.stage.set({ kind: 'warming-badges', done: 0, total: urls.length });
    await warmImageCache(urls, {
      onProgress: (done, total) => this.stage.set({ kind: 'warming-badges', done, total }),
    });
  }
}
```

- [x] **Step 4: Run it to confirm it passes**

Run: `npx ng test --include='src/app/core/data/app-init.service.spec.ts' --watch=false`
Expected: PASS

- [x] **Step 5: Gate the app shell behind the splash**

Replace `src/app/app.ts`:

```typescript
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme/theme.service';
import { AppInitService } from './core/data/app-init.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // Instantiating ThemeService here (rather than only where Settings injects
  // it) is what makes the theme apply app-wide from first paint, not just
  // after visiting /settings.
  private readonly theme = inject(ThemeService);
  readonly appInit = inject(AppInitService);

  constructor() {
    void this.appInit.run();
  }
}
```

Replace `src/app/app.html`:

```html
<div class="app-shell">
  @if (appInit.stage().kind === 'ready') {
    <router-outlet />
  } @else {
    <div class="splash" data-testid="app-splash">
      <p class="splash__title">Preparando o app...</p>
      @if (appInit.stage().kind === 'importing') {
        <p class="splash__status">Importando ligas... {{ $any(appInit.stage()).done }}/{{ $any(appInit.stage()).total }}</p>
      } @else if (appInit.stage().kind === 'warming-badges') {
        <p class="splash__status">Carregando escudos... {{ $any(appInit.stage()).done }}/{{ $any(appInit.stage()).total }}</p>
      }
    </div>
  }
</div>
```

Add to `src/app/app.scss`:

```scss
.splash {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  text-align: center;
}

.splash__title {
  font-size: 1.1rem;
  font-weight: 700;
}

.splash__status {
  font-size: 0.9rem;
  color: var(--text-muted);
}
```

Replace `src/app/app.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { App } from './app';
import { AppInitService, AppInitStage } from './core/data/app-init.service';

describe('App', () => {
  let appInitSpy: { stage: ReturnType<typeof signal<AppInitStage>>; run: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    appInitSpy = {
      stage: signal<AppInitStage>({ kind: 'importing', done: 0, total: 5 }),
      run: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AppInitService, useValue: appInitSpy }],
    }).compileComponents();
  });

  it('creates the app shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows a blocking splash with import progress while not ready', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const splash: HTMLElement = fixture.nativeElement.querySelector('[data-testid="app-splash"]');
    expect(splash?.textContent).toContain('Importando ligas... 0/5');
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeFalsy();
  });

  it('shows badge-warming progress once import finishes', () => {
    appInitSpy.stage.set({ kind: 'warming-badges', done: 3, total: 10 });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const splash: HTMLElement = fixture.nativeElement.querySelector('[data-testid="app-splash"]');
    expect(splash?.textContent).toContain('Carregando escudos... 3/10');
  });

  it('renders the app once initialization is ready', () => {
    appInitSpy.stage.set({ kind: 'ready' });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="app-splash"]')).toBeFalsy();
  });
});
```

- [x] **Step 6: Run the full unit test suite**

Run: `npx ng test --watch=false`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/core/data/app-init.service.ts src/app/core/data/app-init.service.spec.ts \
  src/app/app.ts src/app/app.html src/app/app.scss src/app/app.spec.ts
git commit -m "feat: add AppInitService and gate the app behind a boot-time import splash"
```

---

## Task 9: Update e2e coverage for the new routes

**Files:**
- Modify: `e2e/mvp-flow.spec.ts`

**Interfaces:**
- Consumes: routes `/estudo`, `/jogos`, `/pesquisa` (Tasks 5, 7); `data-testid`s `select-country`, `select-league`, `select-team`, `team-detail`, `home-estudo`, `home-jogos`, `home-pesquisa`.

- [x] **Step 1: Update the existing flow to go through `/estudo` and `/jogos`**

Replace `e2e/mvp-flow.spec.ts`:

```typescript
import { test, expect, Page } from '@playwright/test';

async function selectFirstLeague(page: Page) {
  await page.getByTestId('select-country').first().click();
  await page.getByTestId('select-league').first().click();
}

test('import a league, study one card, and play one round', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('home-estudo').click();

  await selectFirstLeague(page);
  await expect(page.getByTestId('study-link')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('study-link').click();
  // The team-badge placeholder has no intrinsic size until the real badge
  // image finishes fetching from the network, so give it room to load.
  await expect(page.locator('.team-badge')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('reveal').click();
  await page.getByRole('button', { name: 'Bom' }).click();

  await page.goto('/');
  await page.getByTestId('home-jogos').click();
  await selectFirstLeague(page);
  await page.getByTestId('game-link').click();
  const firstOption = page.getByTestId('option').first();
  await expect(firstOption).toBeVisible();
  await expect(page.getByText('1 / 10')).toBeVisible();
  await firstOption.click();
  await expect(page.getByText('2 / 10')).toBeVisible({ timeout: 5_000 });

  await page.goto('/');
  await page.getByTestId('home-stats').click();
  await expect(page.getByText('Estatísticas')).toBeVisible();
});

test('play reverse mode', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('home-jogos').click();

  await selectFirstLeague(page);
  await expect(page.getByTestId('reverse-link')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('reverse-link').click();
  await expect(page.getByText('Reverso')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Qual é o escudo deste time?')).toBeVisible({ timeout: 10_000 });

  const firstOption = page.getByTestId('option').first();
  await expect(firstOption).toBeVisible();
  await expect(page.getByText('1 / 10')).toBeVisible();
  await firstOption.click();
  await expect(page.getByText('2 / 10')).toBeVisible({ timeout: 5_000 });
});

test('browse Pesquisa down to a team detail screen', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('home-pesquisa').click();

  await page.getByTestId('select-country').first().click();
  await page.getByTestId('select-league').first().click();
  // Team badges only appear once the boot-time import has produced a deck
  // for the league (see AppInitService), so give the grid room to populate.
  await expect(page.getByTestId('select-team').first()).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('select-team').first().click();
  await expect(page.getByTestId('team-detail')).toBeVisible();
});
```

- [x] **Step 2: Run the e2e suite**

Run: `npx playwright test`
Expected: PASS (all three tests). If the boot-time import splash extends overall run time, the existing per-assertion `timeout: 30_000` values already give it room; if a run is flaky on first execution, note it and re-run once, since the app's own IndexedDB persists between the two `page.goto('/')` calls within a test but Playwright starts each `test(...)` with a fresh browser context, meaning `AppInitService` re-imports from scratch every test.

- [ ] **Step 3: Commit**

```bash
git add e2e/mvp-flow.spec.ts
git commit -m "test: update e2e flow for /estudo, /jogos routes and add a Pesquisa flow"
```

---

## Self-Review Notes

- **Spec coverage:** Section A → Task 1. Section B → Task 7. Section C → Tasks 4, 8. Section D → Tasks 2, 5. Section E → Tasks 3, 6, 7 (route wiring). Every spec section has a task.
- **Type consistency:** `LeaguePickerAction`, `AppInitStage`, `CountryOption`, `WarmImageCacheOptions` are each defined once and referenced with the same names/shapes in every later task that consumes them.
- **Dead code check:** `initials()` and the unused `ImportService.progress` binding from the old `home.ts` are deliberately not carried into `LeaguePicker` — they were unreferenced in the current template (verified by grep before writing this plan).
