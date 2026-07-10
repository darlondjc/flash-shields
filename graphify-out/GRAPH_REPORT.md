# Graph Report - flash-shields  (2026-07-10)

## Corpus Check
- 99 files · ~129,899 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 486 nodes · 948 edges · 28 communities (23 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `385ae53f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Angular Build Config|Angular Build Config]]
- [[_COMMUNITY_Team Persistence & Cache|Team Persistence & Cache]]
- [[_COMMUNITY_Angular Project Metadata|Angular Project Metadata]]
- [[_COMMUNITY_League Data Import|League Data Import]]
- [[_COMMUNITY_NPM Dependencies|NPM Dependencies]]
- [[_COMMUNITY_Deck & League Models|Deck & League Models]]
- [[_COMMUNITY_SM-2 Spaced Repetition|SM-2 Spaced Repetition]]
- [[_COMMUNITY_Game Loop & Randomness|Game Loop & Randomness]]
- [[_COMMUNITY_App Bootstrap & Routing|App Bootstrap & Routing]]
- [[_COMMUNITY_Home Feature Component|Home Feature Component]]
- [[_COMMUNITY_Service Worker Asset Config|Service Worker Asset Config]]
- [[_COMMUNITY_Environment Config|Environment Config]]
- [[_COMMUNITY_File Structure|File Structure]]
- [[_COMMUNITY_Search|Search]]
- [[_COMMUNITY_settings.ts|settings.ts]]
- [[_COMMUNITY_LeaguePicker|LeaguePicker]]
- [[_COMMUNITY_flash-shields|flash-shields]]
- [[_COMMUNITY_Reestruturação de navegação + módulo de Pesquisa Implementation Plan|Reestruturação de navegação + módulo de Pesquisa Implementation Plan]]
- [[_COMMUNITY_Reestruturação de navegação + módulo de Pesquisa|Reestruturação de navegação + módulo de Pesquisa]]
- [[_COMMUNITY_Global Constraints|Global Constraints]]
- [[_COMMUNITY_Estatísticas — modo Jogo (Fase 2, primeira entrega)|Estatísticas — modo Jogo (Fase 2, primeira entrega)]]
- [[_COMMUNITY_FlashShields|FlashShields]]
- [[_COMMUNITY_badge-warmer.ts|badge-warmer.ts]]
- [[_COMMUNITY_ngsw-config.json|ngsw-config.json]]
- [[_COMMUNITY_vercel.json|vercel.json]]

## God Nodes (most connected - your core abstractions)
1. `Team` - 39 edges
2. `DbService` - 30 edges
3. `League` - 27 edges
4. `Search` - 20 edges
5. `DeckService` - 19 edges
6. `LeaguePicker` - 18 edges
7. `File Structure` - 18 edges
8. `Deck` - 17 edges
9. `LeagueImportConfig` - 16 edges
10. `GameStore` - 15 edges

## Surprising Connections (you probably didn't know these)
- `DeckAccuracy` --references--> `League`  [EXTRACTED]
  src/app/features/stats/stats.store.ts → src/app/core/models/league.model.ts
- `ModeStreak` --references--> `GameMode`  [EXTRACTED]
  src/app/features/stats/stats.store.ts → src/app/core/models/session.model.ts
- `DbService` --references--> `Team`  [EXTRACTED]
  src/app/core/persistence/db.service.ts → src/app/core/models/team.model.ts
- `GameStore` --references--> `Team`  [EXTRACTED]
  src/app/features/game/game.store.ts → src/app/core/models/team.model.ts
- `MultipleChoiceQuestion` --references--> `Team`  [EXTRACTED]
  src/app/features/game/game.util.ts → src/app/core/models/team.model.ts

## Import Cycles
- None detected.

## Communities (28 total, 5 thin omitted)

### Community 0 - "Angular Build Config"
Cohesion: 0.14
Nodes (15): App, AppInitService, ImportService, LeagueImportConfig, LEAGUES_TO_IMPORT, currentSeason(), COUNTRY_FLAGS, countryFlag() (+7 more)

### Community 1 - "Team Persistence & Cache"
Cohesion: 0.14
Nodes (5): BadgeCacheService, Stats, LeagueBadge, LOCAL_BADGE_OVERRIDES, TeamBadge

### Community 2 - "Angular Project Metadata"
Cohesion: 0.07
Nodes (30): build, serve, test, builder, configurations, defaultConfiguration, options, development (+22 more)

### Community 3 - "League Data Import"
Cohesion: 0.11
Nodes (16): DataSourceAdapter, ImportedTeam, LeagueDetails, mapImportedTeamToTeam(), mapTeam(), flushRoundsDiscovering(), tick(), THESPORTSDB_MIN_REQUEST_INTERVAL_MS (+8 more)

### Community 4 - "NPM Dependencies"
Cohesion: 0.06
Nodes (34): dependencies, @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/router, @angular/service-worker (+26 more)

### Community 5 - "Deck & League Models"
Cohesion: 0.11
Nodes (16): FakeImage, DeckService, LeagueService, Deck, DeckScope, League, Session, DbService (+8 more)

### Community 6 - "SM-2 Spaced Repetition"
Cohesion: 0.11
Nodes (12): TeamService, ReviewQuality, ReviewState, Team, StoredReviewState, addDays(), applySm2(), makeState() (+4 more)

### Community 7 - "Game Loop & Randomness"
Cohesion: 0.11
Nodes (13): GameMode, SessionAnswer, SessionService, pickRandom(), shuffle(), Game, GameStore, buildMultipleChoiceQuestions() (+5 more)

### Community 10 - "Service Worker Asset Config"
Cohesion: 0.08
Nodes (25): 10. Stack e ferramentas recomendadas, 1. Visão geral, 2. Fontes de dados (APIs), 3. Modelo de dados, 4. Repetição espaçada (modo Estudo), 5. Modos de jogo / aprendizado, 6. Arquitetura Angular, 7. Persistência e offline (PWA) (+17 more)

### Community 15 - "File Structure"
Cohesion: 0.09
Nodes (21): Definition of Done, File Structure, Flash Shields — MVP (Fase 1) Implementation Plan, Global Constraints, Task 10: SRS service (daily queue + grading), Task 11: Shared TeamBadge, Task 12: Study feature (SRS mode), Task 13: Game feature (multiple choice) (+13 more)

### Community 17 - "settings.ts"
Cohesion: 0.17
Nodes (4): ThemePreference, ThemeService, Settings, ThemeOption

### Community 19 - "flash-shields"
Cohesion: 0.12
Nodes (15): cli, analytics, packageManager, prefix, projectType, root, schematics, sourceRoot (+7 more)

### Community 20 - "Reestruturação de navegação + módulo de Pesquisa Implementation Plan"
Cohesion: 0.15
Nodes (12): Global Constraints, Reestruturação de navegação + módulo de Pesquisa Implementation Plan, Self-Review Notes, Task 1: Navigation shell — remove bottom nav, swap header icon to Home, Task 2: Extract `league-catalog` util (país→liga grouping), Task 3: `TeamService` (get + search by name), Task 4: `warmImageCache` util (badge cache warming), Task 5: `LeaguePicker` component + `/estudo` and `/jogos` routes (+4 more)

### Community 21 - "Reestruturação de navegação + módulo de Pesquisa"
Cohesion: 0.18
Nodes (10): A. Navegação (top bar + remoção da barra inferior), B. Tela inicial (novo Home), C. Importação automática ao abrir o app (splash bloqueante), D. Estudo / Jogos (seletor país→liga reaproveitado), E. Pesquisa (busca + navegação por time), Fora de escopo nesta entrega, Objetivo, Reestruturação de navegação + módulo de Pesquisa (+2 more)

### Community 22 - "Global Constraints"
Cohesion: 0.22
Nodes (8): Estatísticas (modo Jogo) Implementation Plan, Global Constraints, Task 1: Modelo `Session` e tabela `sessions` no Dexie, Task 2: `SessionService`, Task 3: `GameStore` grava a sessão no fim do round, Task 4: `StatsStore`, Task 5: Componente `Stats`, rota `/stats` e link na Home, Task 6: Smoke e2e de navegação até `/stats`

### Community 23 - "Estatísticas — modo Jogo (Fase 2, primeira entrega)"
Cohesion: 0.22
Nodes (8): Agregação, Estatísticas — modo Jogo (Fase 2, primeira entrega), Fluxo de gravação, Fora de escopo nesta entrega, Modelo de dados, Objetivo, Testes, UI e rota

### Community 24 - "FlashShields"
Cohesion: 0.25
Nodes (7): Additional Resources, Building, Code scaffolding, Development server, FlashShields, Running end-to-end tests, Running unit tests

### Community 25 - "badge-warmer.ts"
Cohesion: 0.33
Nodes (3): FakeImage, warmImageCache(), WarmImageCacheOptions

### Community 26 - "ngsw-config.json"
Cohesion: 0.50
Nodes (3): assetGroups, index, $schema

### Community 27 - "vercel.json"
Cohesion: 0.50
Nodes (3): buildCommand, outputDirectory, rewrites

## Knowledge Gaps
- **159 isolated node(s):** `$schema`, `version`, `packageManager`, `analytics`, `newProjectRoot` (+154 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Team` connect `SM-2 Spaced Repetition` to `Angular Build Config`, `Team Persistence & Cache`, `League Data Import`, `Deck & League Models`, `Game Loop & Randomness`, `Search`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `DbService` connect `Deck & League Models` to `Angular Build Config`, `Team Persistence & Cache`, `SM-2 Spaced Repetition`, `Game Loop & Randomness`, `settings.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `Search` connect `Search` to `Angular Build Config`, `SM-2 Spaced Repetition`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `$schema`, `version`, `packageManager` to the rest of the system?**
  _159 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Angular Build Config` be split into smaller, more focused modules?**
  _Cohesion score 0.13949579831932774 - nodes in this community are weakly interconnected._
- **Should `Team Persistence & Cache` be split into smaller, more focused modules?**
  _Cohesion score 0.13852813852813853 - nodes in this community are weakly interconnected._
- **Should `Angular Project Metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.07126436781609195 - nodes in this community are weakly interconnected._