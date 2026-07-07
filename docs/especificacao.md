# Especificação — App de Flashcards de Escudos (estilo Anki)

**Versão:** 1.0 · **Data:** julho/2026
**Stack:** Angular (standalone + Signals) + TypeScript · PWA offline-first

---

## 1. Visão geral

Aplicativo de aprendizado e jogo, no estilo *Anki*, para memorizar escudos de times de futebol. O usuário treina a associação **escudo ↔ nome do time**, com repetição espaçada (spaced repetition) para o modo estudo e desafios cronometrados/pontuados para o modo jogo. O conteúdo é organizável por **liga** e por **país/região**, permitindo montar "baralhos" (decks) focados.

### Objetivos
- Aprender e reter os escudos de forma eficiente (curva de esquecimento).
- Oferecer variação lúdica (quiz, tempo, ranking) além do estudo puro.
- Funcionar **offline** após a primeira sincronização — os escudos ficam em cache local.
- Ser um projeto de portfólio limpo, com arquitetura Angular moderna.

### Não-objetivos (v1)
- Placares ao vivo, estatísticas de jogo, escalações.
- Multiplayer online em tempo real.
- Backend próprio de contas de usuário (v1 é local; sync na nuvem fica para depois).

---

## 2. Fontes de dados (APIs)

Pesquisa feita em jul/2026. Estratégia: **importar uma vez e persistir localmente** (rate limits baixos nas duas APIs gratuitas).

### Fonte primária — TheSportsDB
- Gratuita, colaborativa. Ampla cobertura de ligas de vários países.
- Escudo do time no campo `strBadge` (PNG transparente); também `strLogo` e fanart.
- Endpoints úteis:
  - Listar ligas: `.../api/v1/json/{KEY}/all_leagues.php`
  - Times de uma liga: `.../api/v1/json/{KEY}/lookup_all_teams.php?id={idLiga}`
  - Buscar time por nome: `.../api/v1/json/{KEY}/searchteams.php?t={nome}`
- Imagens em tamanhos reduzidos: acrescente `/medium`, `/small` ou `/tiny` ao fim da URL da imagem.
- IDs de liga são visíveis na URL do site (ex.: Premier League = 4328).
- **Atenção:** limites de taxa apertados no free; métodos foram restringidos ao longo dos anos. Não use como fonte em tempo de execução — importe e cacheie.

### Fonte secundária (opcional) — football-data.org
- REST JSON v4, campo `crest` (ex.: `https://crests.football-data.org/90.png`).
- Free tier: 12 competições, 10 req/min, exige token gratuito.
- Competições grátis: Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, Eredivisie, Primeira Liga, Championship, Brasileirão Série A, Copa do Mundo, Eurocopa.
- Endpoint de time: `GET https://api.football-data.org/v4/teams/{id}` (header `X-Auth-Token`).
- Bom para dados mais limpos das ligas top-tier.

### Camada de abstração
Nunca acople a UI ao formato de uma API específica. Defina modelos próprios (`Team`, `League`, `Region`) e um `DataSourceAdapter` por provedor que traduz o payload externo para esses modelos. Assim é possível trocar/combinar fontes sem mexer no resto do app.

### Observação legal
Escudos são marcas registradas dos clubes. Uso educacional/estudo tende a ser de baixo risco; **redistribuição comercial de logos exige aprovação de marca.** Documente a fonte das imagens e considere um aviso de atribuição.

---

## 3. Modelo de dados

```typescript
// Entidades de domínio (independentes da API)

interface Region {
  id: string;            // 'south-america', 'europe'
  name: string;
  countries: string[];   // ISO codes ou nomes
}

interface League {
  id: string;            // id interno estável
  externalIds: Record<string, string>; // { thesportsdb: '4328', footballdata: 'PL' }
  name: string;          // 'Premier League'
  country: string;       // 'England'
  regionId: string;      // 'europe'
  sport: 'soccer';
  badgeUrl?: string;     // escudo/emblema da liga
}

interface Team {
  id: string;            // id interno estável
  externalIds: Record<string, string>;
  name: string;          // nome oficial
  shortName?: string;    // 'Man City'
  alternateNames: string[]; // apelidos aceitos na resposta digitada
  country: string;
  leagueIds: string[];   // um time pode estar em mais de uma competição
  badgeUrl: string;      // URL remota original
  badgeLocalKey?: string;// chave do blob em cache (IndexedDB)
  founded?: number;
  colors?: string;
}

// Estado de aprendizado por card (algoritmo de repetição espaçada)
interface ReviewState {
  teamId: string;
  deckId: string;
  // Campos estilo SM-2:
  repetitions: number;   // acertos consecutivos
  easeFactor: number;    // fator de facilidade (>= 1.3)
  intervalDays: number;  // intervalo atual até próxima revisão
  dueDate: string;       // ISO — quando volta a aparecer
  lastReviewed?: string;
  lapses: number;        // quantas vezes esqueceu
  suspended: boolean;
}

interface Deck {
  id: string;
  name: string;                 // 'Brasileirão 2026', 'Europa - Top 5'
  scope: DeckScope;
  teamIds: string[];
  createdAt: string;
}

type DeckScope =
  | { kind: 'league'; leagueId: string }
  | { kind: 'country'; country: string }
  | { kind: 'region'; regionId: string }
  | { kind: 'custom' };

// Sessão de jogo/estudo
interface Session {
  id: string;
  deckId: string;
  mode: GameMode;
  startedAt: string;
  endedAt?: string;
  answers: SessionAnswer[];
  score?: number;
}

interface SessionAnswer {
  teamId: string;
  correct: boolean;
  responseMs: number;
  answeredAt: string;
}
```

---

## 4. Repetição espaçada (modo Estudo)

Usar **SM-2** (o algoritmo clássico do Anki) na v1 pela simplicidade; deixar o código isolado num serviço para trocar por **FSRS** depois se quiser mais precisão.

### Fluxo SM-2 (resumo)
Após cada revisão o usuário classifica a lembrança em uma nota `q` (0–5). Simplifique para 4 botões: **Errei (0), Difícil (3), Bom (4), Fácil (5)**.

```typescript
function applySm2(state: ReviewState, quality: 0 | 3 | 4 | 5): ReviewState {
  let { repetitions, easeFactor, intervalDays } = state;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
    return { ...state, repetitions, intervalDays, lapses: state.lapses + 1,
             dueDate: addDays(now(), 1), lastReviewed: now() };
  }

  repetitions += 1;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 6;
  else intervalDays = Math.round(intervalDays * easeFactor);

  easeFactor = Math.max(1.3,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  return { ...state, repetitions, easeFactor, intervalDays,
           dueDate: addDays(now(), intervalDays), lastReviewed: now() };
}
```

- Cards "due" (`dueDate <= hoje`) entram na fila de estudo do dia.
- Cards novos entram com um limite diário configurável (ex.: 20 novos/dia).
- `suspended` remove o card da fila sem apagar histórico.

---

## 5. Modos de jogo / aprendizado

Todos operam sobre um **deck** (montado por liga, país, região ou custom).

| Modo | Descrição | Pontuação |
|------|-----------|-----------|
| **Estudo (SRS)** | Mostra o escudo, usuário tenta lembrar o nome, revela e auto-classifica (Errei/Difícil/Bom/Fácil). Atualiza o `ReviewState`. | — (foco em retenção) |
| **Múltipla escolha** | Mostra o escudo + 4 nomes; escolher o certo. Distratores vêm do mesmo deck (mesma liga/país) para dificultar. | Acertos, streak |
| **Digitar o nome** | Mostra o escudo, usuário digita. Aceita `name`, `shortName` e `alternateNames` com tolerância a acento/caixa. | Acertos, tempo |
| **Reverso** | Mostra o nome, usuário escolhe/aponta o escudo certo entre várias miniaturas. | Acertos |
| **Contra o tempo** | Rodada de N cards com cronômetro; máximo de acertos antes do tempo acabar. | Score = acertos × bônus de velocidade |
| **Sudden death** | Erra uma vez e acaba; vale streak máximo. | Streak recorde |

### Seleção de escopo
Antes de iniciar, o usuário escolhe:
1. **Região** (opcional) → filtra países.
2. **País** (opcional) → filtra ligas.
3. **Liga** (ou várias) → define o conjunto de times.
4. Ou um **deck custom** salvo.

Isso resolve o pedido de "modos por liga ou país/região" com um único fluxo de filtragem em cascata.

---

## 6. Arquitetura Angular

### Princípios
- **Standalone components** (sem NgModules).
- **Signals** para estado reativo local; `computed`/`effect` para derivações.
- **Injeção de dependência** para serviços de dados e domínio.
- **Lazy loading** por rota (feature routes).
- **OnPush** em tudo (Signals já favorecem isso).

### Estrutura de pastas sugerida
```
src/app/
  core/
    models/            # Team, League, Region, Deck, ReviewState...
    data/
      data-source.adapter.ts
      thesportsdb.adapter.ts
      footballdata.adapter.ts
      import.service.ts      # baixa uma vez e persiste
    persistence/
      db.service.ts          # wrapper IndexedDB (Dexie recomendado)
      badge-cache.service.ts  # cache de blobs dos escudos
    srs/
      srs.service.ts         # SM-2 (isolado p/ trocar por FSRS)
  features/
    home/
    decks/                   # criar/editar/listar decks
    study/                   # modo SRS
    game/                    # múltipla escolha, tempo, etc.
    stats/                   # progresso, heatmap, precisão
    settings/
  shared/
    ui/                      # componentes reutilizáveis (badge, timer...)
  app.routes.ts
  app.config.ts
```

### Serviços principais
- `ImportService` — orquestra o download inicial das ligas/times e salva no IndexedDB. Mostra progresso; roda sob demanda (não a cada abertura).
- `BadgeCacheService` — busca o PNG uma vez, guarda como Blob no IndexedDB, serve via `URL.createObjectURL`. Fallback para a URL remota se não estiver em cache.
- `DbService` — abstração sobre IndexedDB (recomendo **Dexie.js** pela ergonomia).
- `SrsService` — implementa `applySm2`, monta a fila diária, expõe contadores (novos/pendentes).
- `DeckService` — CRUD de decks e resolução de escopo (liga/país/região → teamIds).
- `SessionService` — cria sessões, registra respostas, calcula score.
- `StatsService` — deriva métricas a partir de `Session[]` e `ReviewState[]`.

### Rotas (exemplo)
```typescript
export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home.component') },
  { path: 'decks', loadComponent: () => import('./features/decks/decks.component') },
  { path: 'study/:deckId', loadComponent: () => import('./features/study/study.component') },
  { path: 'game/:deckId', loadComponent: () => import('./features/game/game.component') },
  { path: 'stats', loadComponent: () => import('./features/stats/stats.component') },
  { path: 'settings', loadComponent: () => import('./features/settings/settings.component') },
];
```

### Exemplo de serviço com Signals
```typescript
@Injectable({ providedIn: 'root' })
export class StudyStore {
  private srs = inject(SrsService);
  private deckService = inject(DeckService);

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

  reveal() { this.revealed.set(true); }

  async grade(quality: 0 | 3 | 4 | 5) {
    const team = this.current();
    if (!team) return;
    await this.srs.grade(this.deckId()!, team.id, quality);
    this.queue.update(q => q.slice(1));
    this.revealed.set(false);
  }
}
```

---

## 7. Persistência e offline (PWA)

- **IndexedDB** (via Dexie) guarda: `leagues`, `teams`, `regions`, `decks`, `reviewStates`, `sessions`, e os **blobs de escudos**.
- **Service Worker** (`@angular/pwa`) para cache do app shell e funcionamento offline.
- **Estratégia de escudos:** baixar o PNG na primeira exibição (ou em lote durante o import), converter em Blob e persistir. UI sempre lê do cache; rede é só fallback.
- **Import idempotente:** ao reimportar, faz upsert por `externalIds` sem duplicar nem apagar o `ReviewState` do usuário.

---

## 8. Estatísticas e progresso

- Precisão por liga/país/região.
- Heatmap de revisões (estilo GitHub) por dia.
- Curva de retenção / cards maduros vs. jovens.
- Times "problemáticos" (mais lapses) para reforço direcionado.
- Recordes de cada modo de jogo.

---

## 9. Escopo por fases (roadmap)

**MVP (Fase 1)**
- Import de 1–2 ligas via TheSportsDB + cache de escudos.
- Deck por liga.
- Modo Estudo (SM-2) + Múltipla escolha.
- Offline básico.

**Fase 2**
- Decks por país e região (filtro em cascata).
- Modos Digitar, Reverso, Contra o tempo.
- Tela de estatísticas.

**Fase 3**
- FSRS opcional no lugar do SM-2.
- Segunda fonte (football-data.org) e merge de dados.
- Sudden death, ranking local, conquistas.
- Sync na nuvem / contas (backend).

---

## 10. Stack e ferramentas recomendadas

| Área | Escolha |
|------|---------|
| Framework | Angular (standalone + Signals) |
| Linguagem | TypeScript (strict mode) |
| Persistência | IndexedDB via **Dexie.js** |
| PWA | `@angular/pwa` / Service Worker |
| HTTP | `HttpClient` + interceptors (retry, throttle) |
| Testes | Jest/Vitest + Testing Library; Playwright p/ e2e |
| Lint/format | ESLint + Prettier |
| Estado | Signals nativos (evitar NgRx na v1) |

### Cuidados de implementação
- Respeitar rate limits: **nunca** chamar as APIs durante o jogo; só no import.
- Tratar `null` nos payloads (campos ausentes em ligas exóticas).
- Normalizar respostas digitadas (remover acentos, `trim`, lower-case, aceitar apelidos).
- Distratores de múltipla escolha vindos do mesmo escopo para dificuldade real.
- Guardar `externalIds` desde já para permitir merge de fontes no futuro.
