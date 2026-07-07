# Graph Report - .  (2026-07-07)

## Corpus Check
- Corpus is ~46,633 words - fits in a single context window. You may not need a graph.

## Summary
- 209 nodes · 397 edges · 15 communities (13 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `Team` - 24 edges
2. `DbService` - 17 edges
3. `DeckService` - 11 edges
4. `Deck` - 10 edges
5. `League` - 9 edges
6. `flash-shields` - 7 edges
7. `development` - 7 edges
8. `today()` - 7 edges
9. `GameStore` - 7 edges
10. `StudyStore` - 7 edges

## Surprising Connections (you probably didn't know these)
- `DbService` --references--> `Team`  [EXTRACTED]
  src/app/core/persistence/db.service.ts → src/app/core/models/team.model.ts
- `MultipleChoiceQuestion` --references--> `Team`  [EXTRACTED]
  src/app/features/game/game.util.ts → src/app/core/models/team.model.ts
- `makeState()` --calls--> `today()`  [EXTRACTED]
  src/app/core/srs/sm2.spec.ts → src/app/core/srs/sm2.ts
- `TheSportsDbAdapter` --implements--> `DataSourceAdapter`  [EXTRACTED]
  src/app/core/data/thesportsdb.adapter.ts → src/app/core/data/data-source.adapter.ts
- `DbService` --references--> `Deck`  [EXTRACTED]
  src/app/core/persistence/db.service.ts → src/app/core/models/deck.model.ts

## Import Cycles
- None detected.

## Communities (15 total, 2 thin omitted)

### Community 0 - "Angular Build Config"
Cohesion: 0.07
Nodes (30): build, serve, test, builder, configurations, defaultConfiguration, options, development (+22 more)

### Community 1 - "Team Persistence & Cache"
Cohesion: 0.14
Nodes (5): Team, BadgeCacheService, StudyStore, Study, TeamBadge

### Community 2 - "Angular Project Metadata"
Cohesion: 0.07
Nodes (26): cli, analytics, packageManager, prefix, projectType, root, schematics, sourceRoot (+18 more)

### Community 3 - "League Data Import"
Cohesion: 0.18
Nodes (11): DataSourceAdapter, ImportedTeam, ImportService, LeagueImportConfig, MVP_LEAGUES_TO_IMPORT, mapImportedTeamToTeam(), mapTeam(), TheSportsDbAdapter (+3 more)

### Community 4 - "NPM Dependencies"
Cohesion: 0.09
Nodes (21): dependencies, @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/router, @angular/service-worker (+13 more)

### Community 5 - "Deck & League Models"
Cohesion: 0.24
Nodes (6): DeckService, Deck, DeckScope, League, DbService, StoredBadgeBlob

### Community 6 - "SM-2 Spaced Repetition"
Cohesion: 0.28
Nodes (8): ReviewQuality, ReviewState, StoredReviewState, addDays(), applySm2(), makeState(), today(), SrsService

### Community 7 - "Game Loop & Randomness"
Cohesion: 0.23
Nodes (6): pickRandom(), shuffle(), Game, GameStore, buildMultipleChoiceQuestions(), MultipleChoiceQuestion

### Community 8 - "App Bootstrap & Routing"
Cohesion: 0.42
Nodes (3): App, appConfig, routes

### Community 10 - "Service Worker Asset Config"
Cohesion: 0.50
Nodes (3): assetGroups, index, $schema

## Knowledge Gaps
- **66 isolated node(s):** `$schema`, `version`, `packageManager`, `analytics`, `newProjectRoot` (+61 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `flash-shields` connect `Angular Project Metadata` to `Angular Build Config`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Angular Project Metadata` to `NPM Dependencies`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **What connects `$schema`, `version`, `packageManager` to the rest of the system?**
  _66 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Angular Build Config` be split into smaller, more focused modules?**
  _Cohesion score 0.07126436781609195 - nodes in this community are weakly interconnected._
- **Should `Team Persistence & Cache` be split into smaller, more focused modules?**
  _Cohesion score 0.1354679802955665 - nodes in this community are weakly interconnected._
- **Should `Angular Project Metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `NPM Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._