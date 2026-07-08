# Estatísticas (modo Jogo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar sessões do modo Jogo (múltipla escolha) e mostrar precisão geral, precisão por deck e melhor streak numa tela `/stats` nova.

**Architecture:** Novo model `Session`/`SessionAnswer` persistido numa tabela Dexie nova (`sessions`, upgrade incremental do schema). `GameStore` acumula as respostas do round em memória e grava a sessão inteira de uma vez quando o round termina (sem gravação por resposta). `StatsStore` lê `sessions.toArray()` e agrega tudo em memória. `Stats` é um componente standalone novo, mesmo padrão de `Game`/`Study`, na rota `/stats`.

**Tech Stack:** Angular 22 (standalone components, Signals, `ChangeDetectionStrategy.OnPush`), Dexie.js sobre IndexedDB, Vitest + `fake-indexeddb` para testes unitários, Playwright para e2e.

## Global Constraints

- Sessões só do modo Jogo (múltipla escolha) nesta entrega — Estudo (SRS) fica de fora.
- Sem heatmap, curva de retenção, times problemáticos ou precisão por país/região — só total de sessões, precisão geral, precisão por deck e melhor streak por modo.
- Trade-off aceito: round abandonado antes do fim não gera sessão nenhuma (grava tudo de uma vez no fim, não por resposta).
- Segue os padrões já estabelecidos no repo: `@Injectable({ providedIn: 'root' })` para services/stores, Signals para estado, `ChangeDetectionStrategy.OnPush` em componentes, testes com `fake-indexeddb/auto` + `TestBed.inject` usando o `DbService` real (não mockado) para tudo que toca persistência.
- Rodar a suíte inteira com `npx ng test` a cada passo de verificação (builder `@angular/build:unit-test`, roda uma vez e sai, não fica em watch mode). Baseline atual: 18 arquivos de teste, 50 testes passando.

---

### Task 1: Modelo `Session` e tabela `sessions` no Dexie

**Files:**
- Create: `src/app/core/models/session.model.ts`
- Modify: `src/app/core/persistence/db.service.ts`
- Test: `src/app/core/persistence/db.service.spec.ts` (modify)

**Interfaces:**
- Produces: `GameMode` (type, `'multiple-choice'`), `SessionAnswer` (`{ teamId: string; correct: boolean; responseMs: number; answeredAt: string }`), `Session` (`{ id: string; deckId: string; mode: GameMode; startedAt: string; endedAt?: string; answers: SessionAnswer[]; score?: number }`) — todos exportados de `core/models/session.model.ts`.
- Produces: `DbService.sessions: Table<Session, string>`.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/app/core/persistence/db.service.spec.ts`, adicionar o import e um novo `it`:

```typescript
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { DbService } from './db.service';
import { Team } from '../models/team.model';
import { Session } from '../models/session.model';

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

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    deckId: 'deck-1',
    mode: 'multiple-choice',
    startedAt: new Date().toISOString(),
    answers: [],
    score: 0,
    ...overrides,
  };
}

describe('DbService', () => {
  let service: DbService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DbService);
    await service.teams.clear();
    await service.sessions.clear();
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

  it('stores and retrieves a session', async () => {
    await service.sessions.put(makeSession());
    const found = await service.sessions.get('sess-1');
    expect(found?.deckId).toBe('deck-1');
    expect(found?.mode).toBe('multiple-choice');
  });
});
```

Isso substitui o conteúdo inteiro do arquivo (é curto, mais simples reescrever do que remendar).

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx ng test`
Expected: FAIL — erro de compilação, `Cannot find module '../models/session.model'` (o arquivo ainda não existe) e/ou `Property 'sessions' does not exist on type 'DbService'`.

- [ ] **Step 3: Criar o modelo**

Criar `src/app/core/models/session.model.ts`:

```typescript
export type GameMode = 'multiple-choice';

export interface SessionAnswer {
  teamId: string;
  correct: boolean;
  responseMs: number;
  answeredAt: string;
}

export interface Session {
  id: string;
  deckId: string;
  mode: GameMode;
  startedAt: string;
  endedAt?: string;
  answers: SessionAnswer[];
  score?: number;
}
```

- [ ] **Step 4: Adicionar a tabela `sessions` no Dexie**

Substituir o conteúdo de `src/app/core/persistence/db.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { League } from '../models/league.model';
import { Team } from '../models/team.model';
import { Deck } from '../models/deck.model';
import { ReviewState } from '../models/review-state.model';
import { Session } from '../models/session.model';

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
  sessions!: Table<Session, string>;

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

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx ng test`
Expected: PASS — `Test Files 18 passed (18)`, `Tests 51 passed (51)`.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/models/session.model.ts src/app/core/persistence/db.service.ts src/app/core/persistence/db.service.spec.ts
git commit -m "feat: add Session model and sessions table"
```

---

### Task 2: `SessionService`

**Files:**
- Create: `src/app/core/session/session.service.ts`
- Test: `src/app/core/session/session.service.spec.ts`

**Interfaces:**
- Consumes: `DbService.sessions: Table<Session, string>` (Task 1), `Session`/`SessionAnswer`/`GameMode` de `core/models/session.model.ts` (Task 1).
- Produces: `SessionService.finish(deckId: string, mode: GameMode, answers: SessionAnswer[], startedAt: string): Promise<Session>`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/core/session/session.service.spec.ts`:

```typescript
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';
import { DbService } from '../persistence/db.service';
import { SessionAnswer } from '../models/session.model';

function makeAnswer(overrides: Partial<SessionAnswer> = {}): SessionAnswer {
  return {
    teamId: 'ts-1',
    correct: true,
    responseMs: 1200,
    answeredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('SessionService', () => {
  let service: SessionService;
  let db: DbService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SessionService);
    db = TestBed.inject(DbService);
    await db.sessions.clear();
  });

  it('persists a session with a computed score', async () => {
    const answers = [makeAnswer({ correct: true }), makeAnswer({ correct: false })];
    const startedAt = new Date().toISOString();

    const session = await service.finish('deck-1', 'multiple-choice', answers, startedAt);

    expect(session.deckId).toBe('deck-1');
    expect(session.mode).toBe('multiple-choice');
    expect(session.answers).toEqual(answers);
    expect(session.score).toBe(1);
    expect(session.endedAt).toBeTruthy();

    const stored = await db.sessions.get(session.id);
    expect(stored?.score).toBe(1);
  });

  it('computes a score of 0 when there are no correct answers', async () => {
    const session = await service.finish(
      'deck-1',
      'multiple-choice',
      [makeAnswer({ correct: false })],
      new Date().toISOString(),
    );
    expect(session.score).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx ng test`
Expected: FAIL — `Cannot find module './session.service'`.

- [ ] **Step 3: Implementar `SessionService`**

Criar `src/app/core/session/session.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { DbService } from '../persistence/db.service';
import { GameMode, Session, SessionAnswer } from '../models/session.model';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private db = inject(DbService);

  async finish(
    deckId: string,
    mode: GameMode,
    answers: SessionAnswer[],
    startedAt: string,
  ): Promise<Session> {
    const session: Session = {
      id: crypto.randomUUID(),
      deckId,
      mode,
      startedAt,
      endedAt: new Date().toISOString(),
      answers,
      score: answers.filter(answer => answer.correct).length,
    };
    await this.db.sessions.put(session);
    return session;
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx ng test`
Expected: PASS — `Test Files 19 passed (19)`, `Tests 53 passed (53)`.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/session/session.service.ts src/app/core/session/session.service.spec.ts
git commit -m "feat: add SessionService.finish() to persist game sessions"
```

---

### Task 3: `GameStore` grava a sessão no fim do round

**Files:**
- Modify: `src/app/features/game/game.store.ts`
- Test: `src/app/features/game/game.store.spec.ts` (modify)

**Interfaces:**
- Consumes: `SessionService.finish(deckId, mode, answers, startedAt)` (Task 2), `SessionAnswer` (Task 1).
- Produces: `GameStore.answers: Signal<SessionAnswer[]>`, `GameStore.startedAt: Signal<string | null>`, `GameStore.next(): Promise<void>` (antes era síncrono — chamadas existentes como `store.next()` continuam válidas sem `await`, os signals de índice/finished são atualizados de forma síncrona antes do primeiro `await` interno).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do `describe('GameStore', ...)` em `src/app/features/game/game.store.spec.ts` (depois do `it('next() advances...')` existente), e adicionar `await db.sessions.clear();` no `beforeEach`:

```typescript
  beforeEach(async () => {
    deckServiceSpy = { getDeck: vi.fn().mockResolvedValue(deck) };

    TestBed.configureTestingModule({ providers: [{ provide: DeckService, useValue: deckServiceSpy }] });
    store = TestBed.inject(GameStore);
    db = TestBed.inject(DbService);
    await db.teams.clear();
    await db.teams.bulkPut(deck.teamIds.map(makeTeam));
    await db.sessions.clear();
  });
```

E os dois testes novos, no final do arquivo:

```typescript
  it('records a session once the round finishes', async () => {
    await store.load('deck-1', 1);
    const correctId = store.current()!.correctTeam.id;
    store.select(correctId);
    await store.next();

    const sessions = await db.sessions.where('deckId').equals('deck-1').toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].mode).toBe('multiple-choice');
    expect(sessions[0].score).toBe(1);
    expect(sessions[0].answers).toHaveLength(1);
    expect(sessions[0].answers[0].correct).toBe(true);
  });

  it('does not record a session before the round finishes', async () => {
    await store.load('deck-1', 3);
    store.select(store.current()!.correctTeam.id);
    await store.next();

    const sessions = await db.sessions.where('deckId').equals('deck-1').toArray();
    expect(sessions).toHaveLength(0);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx ng test`
Expected: FAIL — os dois testes novos falham (`sessions` vazio quando deveria ter 1 registro), `GameStore` ainda não grava nada.

- [ ] **Step 3: Implementar a gravação no `GameStore`**

Substituir o conteúdo de `src/app/features/game/game.store.ts`:

```typescript
import { Injectable, inject, signal, computed } from '@angular/core';
import { DeckService } from '../../core/decks/deck.service';
import { DbService } from '../../core/persistence/db.service';
import { SessionService } from '../../core/session/session.service';
import { Team } from '../../core/models/team.model';
import { SessionAnswer } from '../../core/models/session.model';
import { buildMultipleChoiceQuestions, MultipleChoiceQuestion } from './game.util';

const DEFAULT_ROUND_SIZE = 10;

@Injectable({ providedIn: 'root' })
export class GameStore {
  private deckService = inject(DeckService);
  private db = inject(DbService);
  private sessionService = inject(SessionService);

  private deckId: string | null = null;
  private questionShownAt = 0;

  readonly questions = signal<MultipleChoiceQuestion[]>([]);
  readonly index = signal(0);
  readonly score = signal(0);
  readonly streak = signal(0);
  readonly bestStreak = signal(0);
  readonly selectedTeamId = signal<string | null>(null);
  readonly answers = signal<SessionAnswer[]>([]);
  readonly startedAt = signal<string | null>(null);

  readonly current = computed(() => this.questions()[this.index()] ?? null);
  readonly total = computed(() => this.questions().length);
  readonly finished = computed(
    () => this.questions().length > 0 && this.index() >= this.questions().length,
  );

  async load(deckId: string, roundSize: number = DEFAULT_ROUND_SIZE) {
    const deck = await this.deckService.getDeck(deckId);
    this.deckId = deckId;
    this.questions.set([]);
    this.index.set(0);
    this.score.set(0);
    this.streak.set(0);
    this.bestStreak.set(0);
    this.selectedTeamId.set(null);
    this.answers.set([]);
    this.startedAt.set(new Date().toISOString());
    if (!deck) return;

    const teams = (await this.db.teams.bulkGet(deck.teamIds)).filter((t): t is Team => !!t);
    this.questions.set(buildMultipleChoiceQuestions(teams, roundSize));
    this.questionShownAt = Date.now();
  }

  select(teamId: string) {
    const question = this.current();
    if (!question || this.selectedTeamId()) return;
    this.selectedTeamId.set(teamId);

    const correct = teamId === question.correctTeam.id;
    this.answers.update(list => [
      ...list,
      {
        teamId: question.correctTeam.id,
        correct,
        responseMs: Date.now() - this.questionShownAt,
        answeredAt: new Date().toISOString(),
      },
    ]);

    if (correct) {
      this.score.update(s => s + 1);
      this.streak.update(s => s + 1);
      this.bestStreak.update(b => Math.max(b, this.streak()));
    } else {
      this.streak.set(0);
    }
  }

  async next() {
    this.index.update(i => i + 1);
    this.selectedTeamId.set(null);

    if (this.finished()) {
      await this.recordSession();
    } else {
      this.questionShownAt = Date.now();
    }
  }

  private async recordSession() {
    const startedAt = this.startedAt();
    if (!this.deckId || !startedAt) return;
    await this.sessionService.finish(this.deckId, 'multiple-choice', this.answers(), startedAt);
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx ng test`
Expected: PASS — `Test Files 19 passed (19)`, `Tests 55 passed (55)`.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/game/game.store.ts src/app/features/game/game.store.spec.ts
git commit -m "feat: record a session when a game round finishes"
```

---

### Task 4: `StatsStore`

**Files:**
- Create: `src/app/features/stats/stats.store.ts`
- Test: `src/app/features/stats/stats.store.spec.ts`

**Interfaces:**
- Consumes: `DbService.sessions`, `DbService.decks` (Task 1 e código existente), `Session`/`GameMode` (Task 1).
- Produces: `DeckAccuracy` (`{ deckId: string; deckName: string; sessionCount: number; accuracy: number }`), `ModeStreak` (`{ mode: GameMode; bestStreak: number }`), `StatsStore.totalSessions: Signal<number>`, `StatsStore.overallAccuracy: Signal<number>`, `StatsStore.accuracyByDeck: Signal<DeckAccuracy[]>`, `StatsStore.bestStreakByMode: Signal<ModeStreak[]>`, `StatsStore.load(): Promise<void>`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/app/features/stats/stats.store.spec.ts`:

```typescript
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { StatsStore } from './stats.store';
import { DbService } from '../../core/persistence/db.service';
import { Session } from '../../core/models/session.model';
import { Deck } from '../../core/models/deck.model';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: crypto.randomUUID(),
    deckId: 'deck-1',
    mode: 'multiple-choice',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    answers: [],
    score: 0,
    ...overrides,
  };
}

function answer(correct: boolean) {
  return { teamId: 't1', correct, responseMs: 1000, answeredAt: new Date().toISOString() };
}

describe('StatsStore', () => {
  let store: StatsStore;
  let db: DbService;

  const deck: Deck = {
    id: 'deck-1',
    name: 'Premier League',
    scope: { kind: 'league', leagueId: 'ts-4328' },
    teamIds: [],
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(StatsStore);
    db = TestBed.inject(DbService);
    await db.sessions.clear();
    await db.decks.clear();
    await db.decks.put(deck);
  });

  it('reports zeroed stats when there are no sessions', async () => {
    await store.load();
    expect(store.totalSessions()).toBe(0);
    expect(store.overallAccuracy()).toBe(0);
    expect(store.accuracyByDeck()).toEqual([]);
    expect(store.bestStreakByMode()).toEqual([]);
  });

  it('aggregates total sessions and overall accuracy across all sessions', async () => {
    await db.sessions.bulkPut([
      makeSession({ answers: [answer(true), answer(false)] }),
      makeSession({ id: crypto.randomUUID(), answers: [answer(true)] }),
    ]);

    await store.load();

    expect(store.totalSessions()).toBe(2);
    expect(store.overallAccuracy()).toBeCloseTo(2 / 3);
  });

  it('breaks down accuracy per deck using the deck name', async () => {
    await db.sessions.put(makeSession({ deckId: 'deck-1', answers: [answer(true)] }));

    await store.load();

    expect(store.accuracyByDeck()).toEqual([
      { deckId: 'deck-1', deckName: 'Premier League', sessionCount: 1, accuracy: 1 },
    ]);
  });

  it('computes the best consecutive-correct streak per mode', async () => {
    await db.sessions.put(
      makeSession({ answers: [answer(true), answer(true), answer(false), answer(true)] }),
    );

    await store.load();

    expect(store.bestStreakByMode()).toEqual([{ mode: 'multiple-choice', bestStreak: 2 }]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx ng test`
Expected: FAIL — `Cannot find module './stats.store'`.

- [ ] **Step 3: Implementar `StatsStore`**

Criar `src/app/features/stats/stats.store.ts`:

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { DbService } from '../../core/persistence/db.service';
import { GameMode, Session } from '../../core/models/session.model';

export interface DeckAccuracy {
  deckId: string;
  deckName: string;
  sessionCount: number;
  accuracy: number;
}

export interface ModeStreak {
  mode: GameMode;
  bestStreak: number;
}

@Injectable({ providedIn: 'root' })
export class StatsStore {
  private db = inject(DbService);

  readonly totalSessions = signal(0);
  readonly overallAccuracy = signal(0);
  readonly accuracyByDeck = signal<DeckAccuracy[]>([]);
  readonly bestStreakByMode = signal<ModeStreak[]>([]);

  async load() {
    const sessions = await this.db.sessions.toArray();

    this.totalSessions.set(sessions.length);
    this.overallAccuracy.set(computeAccuracy(sessions.flatMap(session => session.answers)));
    this.accuracyByDeck.set(await this.computeAccuracyByDeck(sessions));
    this.bestStreakByMode.set(computeBestStreakByMode(sessions));
  }

  private async computeAccuracyByDeck(sessions: Session[]): Promise<DeckAccuracy[]> {
    const sessionsByDeck = new Map<string, Session[]>();
    for (const session of sessions) {
      const list = sessionsByDeck.get(session.deckId) ?? [];
      list.push(session);
      sessionsByDeck.set(session.deckId, list);
    }

    const results: DeckAccuracy[] = [];
    for (const [deckId, deckSessions] of sessionsByDeck) {
      const deck = await this.db.decks.get(deckId);
      results.push({
        deckId,
        deckName: deck?.name ?? deckId,
        sessionCount: deckSessions.length,
        accuracy: computeAccuracy(deckSessions.flatMap(session => session.answers)),
      });
    }
    return results;
  }
}

function computeAccuracy(answers: { correct: boolean }[]): number {
  if (answers.length === 0) return 0;
  return answers.filter(answer => answer.correct).length / answers.length;
}

function computeBestStreakByMode(sessions: Session[]): ModeStreak[] {
  const bestByMode = new Map<GameMode, number>();
  for (const session of sessions) {
    const streak = longestCorrectStreak(session.answers);
    bestByMode.set(session.mode, Math.max(bestByMode.get(session.mode) ?? 0, streak));
  }
  return Array.from(bestByMode, ([mode, bestStreak]) => ({ mode, bestStreak }));
}

function longestCorrectStreak(answers: { correct: boolean }[]): number {
  let longest = 0;
  let current = 0;
  for (const answer of answers) {
    current = answer.correct ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx ng test`
Expected: PASS — `Test Files 20 passed (20)`, `Tests 59 passed (59)`.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/stats/stats.store.ts src/app/features/stats/stats.store.spec.ts
git commit -m "feat: add StatsStore aggregating session accuracy and streaks"
```

---

### Task 5: Componente `Stats`, rota `/stats` e link na Home

**Files:**
- Create: `src/app/features/stats/stats.ts`
- Create: `src/app/features/stats/stats.html`
- Create: `src/app/features/stats/stats.scss`
- Create: `src/app/features/stats/stats.spec.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/app.routes.spec.ts`
- Modify: `src/app/features/home/home.html`
- Modify: `src/app/features/home/home.scss`
- Modify: `src/app/features/home/home.spec.ts`

**Interfaces:**
- Consumes: `StatsStore` (Task 4).
- Produces: rota `/stats`, `data-testid="stats-link"` na Home, `data-testid="deck-accuracy"` e `data-testid="mode-streak"` na tela de estatísticas.

- [ ] **Step 1: Escrever os testes que falham (rotas, home, stats)**

Substituir `src/app/app.routes.spec.ts`:

```typescript
import { routes } from './app.routes';

describe('routes', () => {
  it('defines the home, study, game, and stats routes', () => {
    const paths = routes.map(route => route.path);
    expect(paths).toEqual(['', 'study/:deckId', 'game/:deckId', 'stats']);
  });
});
```

Adicionar ao final do `describe('Home', ...)` em `src/app/features/home/home.spec.ts`:

```typescript
  it('always shows a link to the stats page', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const statsLink = fixture.nativeElement.querySelector('[data-testid="stats-link"]');
    expect(statsLink).toBeTruthy();
  });
```

Criar `src/app/features/stats/stats.spec.ts`:

```typescript
import 'fake-indexeddb/auto';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Stats } from './stats';
import { DbService } from '../../core/persistence/db.service';
import { Deck } from '../../core/models/deck.model';
import { Session } from '../../core/models/session.model';

describe('Stats', () => {
  let fixture: ComponentFixture<Stats>;
  let db: DbService;

  const deck: Deck = {
    id: 'deck-1',
    name: 'Premier League',
    scope: { kind: 'league', leagueId: 'ts-4328' },
    teamIds: [],
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Stats],
      providers: [provideRouter([])],
    }).compileComponents();
    db = TestBed.inject(DbService);
    await db.sessions.clear();
    await db.decks.clear();
    await db.decks.put(deck);
  });

  it('shows the empty state when there are no sessions', async () => {
    fixture = TestBed.createComponent(Stats);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyState?.textContent).toContain('Nenhuma partida ainda');
  });

  it('shows aggregated numbers when sessions exist', async () => {
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

    const deckRow = fixture.nativeElement.querySelector('[data-testid="deck-accuracy"]');
    expect(deckRow.textContent).toContain('Premier League');
    expect(deckRow.textContent).toContain('100%');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx ng test`
Expected: FAIL — `routes` não inclui `'stats'`, `stats-link` não encontrado na Home, `Cannot find module './stats'` para o novo spec.

- [ ] **Step 3: Criar o componente `Stats`**

Criar `src/app/features/stats/stats.ts`:

```typescript
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatsStore } from './stats.store';

@Component({
  selector: 'app-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './stats.html',
  styleUrl: './stats.scss',
})
export class Stats {
  readonly store = inject(StatsStore);

  constructor() {
    this.store.load();
  }

  formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  modeLabel(mode: string): string {
    return mode === 'multiple-choice' ? 'Múltipla escolha' : mode;
  }
}
```

Criar `src/app/features/stats/stats.html`:

```html
<header class="app-header">
  <div class="app-header__side">
    <a routerLink="/" class="icon-btn" aria-label="Voltar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M15 5 8 12l7 7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </a>
  </div>
  <div class="app-header__title">Estatísticas</div>
  <div class="app-header__side"></div>
</header>

<main class="screen">
  @if (store.totalSessions() === 0) {
    <section class="card empty-state">
      <p class="empty-state__title">Nenhuma partida ainda</p>
      <p class="empty-state__subtitle">
        Jogue uma rodada de múltipla escolha pra começar a acompanhar seu progresso.
      </p>
      <a routerLink="/" class="btn btn--primary">Ir jogar</a>
    </section>
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
            <span class="deck-accuracy-row__name">{{ deck.deckName }}</span>
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
  }
</main>
```

Criar `src/app/features/stats/stats.scss`:

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

.empty-state {
  padding: 2.5rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
}

.empty-state__title {
  font-size: 1.1rem;
  font-weight: 700;
}

.empty-state__subtitle {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}

.deck-accuracy-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 1.5rem;
}

.deck-accuracy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
}

.deck-accuracy-row__name {
  font-weight: 700;
  font-size: 0.9rem;
}

.deck-accuracy-row__value {
  font-weight: 800;
  color: var(--text-muted);
}
```

- [ ] **Step 4: Registrar a rota `/stats`**

Substituir `src/app/app.routes.ts`:

```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then(m => m.Home),
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
];
```

- [ ] **Step 5: Adicionar o link na Home**

Em `src/app/features/home/home.html`, adicionar logo após o `@if (error()) { ... }` e antes de `<section aria-label="Ligas disponíveis">`:

```html
  <a routerLink="/stats" class="deck-row nav-row" data-testid="stats-link">
    <span class="deck-row__icon deck-row__icon--orange">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M4 20V10M12 20V4M20 20v-7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span class="deck-row__text">
      <span class="deck-row__title">Estatísticas</span>
      <span class="deck-row__subtitle">Seu progresso no jogo</span>
    </span>
    <span class="deck-row__chevron">›</span>
  </a>
```

Em `src/app/features/home/home.scss`, adicionar ao final:

```scss
.nav-row {
  margin-bottom: 1.5rem;
}

.deck-row__icon--orange {
  background: rgba(245, 158, 11, 0.16);
  color: var(--orange);
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx ng test`
Expected: PASS — `Test Files 21 passed (21)`, `Tests 62 passed (62)`.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/stats/stats.ts src/app/features/stats/stats.html src/app/features/stats/stats.scss src/app/features/stats/stats.spec.ts src/app/app.routes.ts src/app/app.routes.spec.ts src/app/features/home/home.html src/app/features/home/home.scss src/app/features/home/home.spec.ts
git commit -m "feat: add Stats screen at /stats with a link from Home"
```

---

### Task 6: Smoke e2e de navegação até `/stats`

**Files:**
- Modify: `e2e/mvp-flow.spec.ts`

**Interfaces:**
- Consumes: `data-testid="stats-link"` (Task 5), rota `/stats` (Task 5).

Escopo deliberadamente pequeno: completar uma rodada inteira de 10 perguntas no e2e seria lento e frágil (depende da API externa retornar times suficientes durante o import). Este passo só confirma que a navegação e a renderização da tela funcionam, sem depender de terminar o round.

- [ ] **Step 1: Adicionar o passo de navegação ao teste existente**

Ao final de `e2e/mvp-flow.spec.ts`, dentro do `test(...)` já existente, depois do bloco que verifica o botão "Próxima":

```typescript
import { test, expect } from '@playwright/test';

test('import a league, study one card, and play one round', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('import').click();
  await expect(page.getByTestId('study-link')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('study-link').click();
  // The team-badge placeholder has no intrinsic size until the real badge
  // image finishes fetching from the network, so give it room to load.
  await expect(page.locator('.team-badge')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('reveal').click();
  await page.getByRole('button', { name: 'Bom' }).click();

  await page.goto('/');
  await page.getByTestId('game-link').click();
  const firstOption = page.getByTestId('option').first();
  await expect(firstOption).toBeVisible();
  await firstOption.click();
  await expect(page.getByRole('button', { name: 'Próxima' })).toBeVisible();

  await page.goto('/');
  await page.getByTestId('stats-link').click();
  await expect(page.getByText('Estatísticas')).toBeVisible();
});
```

- [ ] **Step 2: Rodar o e2e e confirmar que passa**

Run: `npx playwright test`
Expected: PASS — 1 teste passando (o e2e existente estendido).

- [ ] **Step 3: Commit**

```bash
git add e2e/mvp-flow.spec.ts
git commit -m "test: extend e2e smoke flow to cover navigation to /stats"
```
