# Reestruturação de navegação + módulo de Pesquisa

**Data:** 2026-07-09
**Contexto:** Home hoje concentra toda a seleção país→liga→ação (Estudar/Jogar/Reverso), a barra inferior tem só um item funcional (Início, o resto é placeholder desabilitado), e não existe nenhuma tela de consulta/enciclopédia de times. Esta entrega reestrutura a navegação em torno de uma tela inicial com cards e adiciona um módulo de Pesquisa por time.

## Objetivo

- Home vira um menu de cards (Estudo, Jogos, Stats, Pesquisa) em vez de embutir a seleção de liga.
- Remover a barra inferior, que hoje é quase toda decorativa.
- Importar todas as ligas/times automaticamente no primeiro uso do app, com feedback visual, para que Estudo/Jogos/Pesquisa já encontrem tudo pronto.
- Adicionar uma tela de Pesquisa: busca por time, cards de país, drill-down país→liga→times (grid 3 colunas)→detalhe do time.

## Fora de escopo nesta entrega

- Artilheiro, títulos nacionais e maior título na tela do time — a API atual (TheSportsDB, tier gratuito) não fornece esses dados de forma estruturada. Fica só o que a API já dá: nome, apelido, país, ano de fundação/idade, nomes alternativos, ligas.
- Cache de escudos em blob no IndexedDB para todos os escudos — a CDN do TheSportsDB não envia cabeçalho CORS, então isso já falha hoje pra praticamente todo escudo (ver comentário em `badge-cache.service.ts`). Em vez disso, o splash aquece o cache HTTP nativo do navegador (detalhe na seção de import).
- Reimportação periódica/sob demanda de ligas já importadas (ex. atualizar dados de um time que mudou de nome). Fica pra uma entrega futura se fizer falta.
- Itens "em breve" (`comingSoon: true` em `LEAGUES_TO_IMPORT`, ex. Copa do Mundo) continuam fora do fluxo de import automático e fora da Pesquisa, igual a hoje.

## A. Navegação (top bar + remoção da barra inferior)

- `app.html`: remove o `<nav class="bottom-nav">` inteiro.
- Todo `app-header` (em `home`, `study`, `game`, `stats`, `settings`, e os componentes novos) usa `Home01Icon` como ícone esquerdo, linkando para `/`. Substitui o `ArrowLeft01Icon` atual em `study`/`game`/`stats`/`settings` e o brand-mark estático (`Shield01Icon`) em `home`.
- `study.back()`/`game.back()` mantêm o comportamento atual (`confirm()` se houver sessão em progresso, depois `router.navigate(['/'], ...)`) — só troca o ícone/label, não a lógica.
- Ícone de configurações continua no canto direito, só na tela inicial.

## B. Tela inicial (novo Home)

`home.ts`/`home.html` perdem toda a lógica de país→liga→ação. Viram um grid de 4 cards:

- **Estudo** (`Book01Icon`) → `/estudo`
- **Jogos** (`Quiz01Icon`) → `/jogos`
- **Stats** (`ChartColumnIncreasingIcon`) → `/stats` (rota já existente, sem mudança)
- **Pesquisa** (`Search01Icon`) → `/pesquisa`

Cada card: ícone, título, subtítulo curto (ex. "Revisão espaçada", "Múltipla escolha e reverso", "Seu progresso", "Times e ligas").

## C. Importação automática ao abrir o app (splash bloqueante)

Serviço novo `core/data/app-init.service.ts`, executado em `app.ts` antes de renderizar o `router-outlet`:

1. **Checagem:** para cada config em `LEAGUES_TO_IMPORT` (exceto `comingSoon`), verifica se a liga já tem `League` + `Team`s + `Deck` no Dexie. Se tudo presente, libera o app direto (sem splash perceptível).
2. **Import de metadados (se faltar algo):** tela cheia de progresso ("Importando ligas… 5/11") chamando `ImportService.importLeague(config)` + `DeckService.createLeagueDeck(league)` sequencialmente para cada liga faltante, atualizando o contador a cada liga concluída.
3. **Aquecimento de escudos:** ao terminar o passo 2, um segundo estágio do progresso ("Carregando escudos… 80/240") dispara o carregamento de todas as URLs de escudo (ligas + times recém-importados) via `new Image()` em paralelo (sem passar pelo `BadgeCacheService`, que tenta blob-fetch e falha por CORS — aqui só queremos que o navegador cacheie a resposta HTTP, o que não exige ler os bytes). Cada imagem tem um timeout individual (ex. 5s) para não travar o app se uma URL estiver fora do ar; falha de uma imagem não bloqueia as demais.
4. Ao concluir (ou estourar timeout) os dois estágios, libera o app na tela inicial.

Próximas aberturas do app: a checagem do passo 1 roda de novo; se tudo já estiver importado, não reimporta nada. Se uma liga nova for adicionada ao código (`LEAGUES_TO_IMPORT`) num update, só ela passa pelos passos 2–3.

## D. Estudo / Jogos (seletor país→liga reaproveitado)

Lógica de agrupamento hoje em `home.ts` (`countryOptions()`, `leaguesForCountry()`) é extraída para um util compartilhado (`core/leagues/league-catalog.ts` ou similar), usado tanto pelo seletor quanto pela Pesquisa (seção E).

Novo componente compartilhado `shared/ui/league-picker` (ou `features/league-picker`), reaproveitando o template país→liga→card-final que hoje existe em `home.html`. Recebe um input:

```typescript
@Input() actions: ('study' | 'play' | 'reverse')[];
```

- Rota **`/estudo`**: `LeaguePicker` com `actions: ['study']` — card final mostra só "Estudar".
- Rota **`/jogos`**: `LeaguePicker` com `actions: ['play', 'reverse']` — card final mostra "Múltipla escolha" e "Reverso".

Mantém o fallback de import lazy por liga (`selectLeague()` chamando `ImportService` se a liga selecionada ainda não tiver deck) como rede de segurança, já que a lógica já existe e o custo de manter é baixo — mas na prática não deve disparar, pois o splash da seção C garante tudo importado.

Cada rota restaura seleção via `?league=` na query string, igual ao padrão atual de `home.ts`.

## E. Pesquisa (busca + navegação por time)

Nova rota **`/pesquisa`**, componente próprio `features/search/search.ts` (não reaproveita o `LeaguePicker`, pois o passo final é grid de times, não ações de deck).

**Barra de busca (topo):** input ligado a `query = signal('')`.
- `query()` vazio → mostra cards de país (mesmo util da seção D).
- `query()` não vazio → busca global, ignora país selecionado: filtra times (`db.teams`) cujo `name`/`shortName`/`alternateNames` contém a query (comparação case-insensitive por substring simples; não normaliza acentos nesta entrega — "Sao Paulo" não encontra "São Paulo"), resolve as ligas às quais esses times pertencem (via `deck.teamIds`), e mostra a lista de ligas encontradas — cada card de liga mostra a bandeira do país, já que o agrupamento por país não se aplica no modo busca.

**Drill-down por clique:**
1. Card de país → lista de ligas do país (igual ao padrão atual).
2. Card de liga → grid de times em 3 colunas: escudo + nome, usando `deck.teamIds` do deck já existente daquela liga (evita recalcular pertencimento).
3. Card de time → tela de detalhe do time:
   - Escudo grande
   - Nome + apelido (`shortName`, se houver)
   - País
   - Ano de fundação + idade calculada (`new Date().getFullYear() - founded`, se `founded` existir)
   - Nomes alternativos (`alternateNames`, se houver)
   - Liga(s) a que pertence (resolvendo `leagueIds` para nome via `LeagueService`)

Cada nível tem um botão "Trocar país" / "Trocar liga" / "Voltar aos times", no mesmo padrão visual de `section-header__back` que já existe em `home.html`. O ícone de home no header (seção A) sempre vai direto pra tela inicial, não serve de "voltar um nível" — consistente com o comportamento já existente em `study`/`game`.

Estado restaurado via query params `?league=` e `?team=`, no mesmo padrão de `home.ts`.

Novo `core/leagues/team.service.ts` (mirror de `LeagueService`):

```typescript
@Injectable({ providedIn: 'root' })
export class TeamService {
  getTeam(id: string): Promise<Team | undefined>;
}
```

## Rotas (resumo)

```typescript
{ path: '', loadComponent: Home }                 // cards
{ path: 'estudo', loadComponent: StudySelect }    // LeaguePicker actions=['study']
{ path: 'jogos', loadComponent: GameSelect }       // LeaguePicker actions=['play','reverse']
{ path: 'pesquisa', loadComponent: Search }         // busca + país→liga→times→detalhe
{ path: 'study/:deckId', loadComponent: Study }     // inalterado
{ path: 'game/:deckId', loadComponent: Game }       // inalterado
{ path: 'stats', loadComponent: Stats }             // inalterado
{ path: 'settings', loadComponent: Settings }       // inalterado
```

## Testes

- `app-init.service.spec.ts` — checagem detecta ligas faltantes corretamente; não reimporta o que já existe; aquecimento de escudos não bloqueia em caso de falha de uma imagem (timeout).
- `league-catalog.spec.ts` — agrupamento por país e filtro por país, casos com liga `comingSoon` excluída.
- `league-picker.spec.ts` — renderiza só as ações do input `actions` recebido, nos dois casos (`['study']` e `['play','reverse']`).
- `team.service.spec.ts` — `getTeam` recupera time gravado.
- `search.spec.ts` — busca vazia mostra países; busca com nome de time filtra ligas corretamente (inclui caso sem resultado); drill-down país→liga→times→detalhe navega corretamente; restauração via query params.
- E2E (Playwright, `e2e/`): atualizar fluxo existente (`mvp-flow.spec.ts`) para refletir as novas rotas `/estudo`/`/jogos` no lugar da seleção direto na Home; adicionar um fluxo cobrindo Pesquisa até a tela de detalhe do time.
