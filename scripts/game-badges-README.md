# Pipeline de escudos "jogo" (PaddleOCR)

Gera uma variante de cada escudo com o nome do time borrado, especificamente
pros modos Múltipla escolha e Reverso (`Team.badgeGameUrl`). Não confundir com
`scripts/question-badges.mjs`, que gera `badgeQuestionUrl` pra Study
reescrevendo o escudo inteiro via Gemini — pipeline separado, motivo no
cabeçalho de `game-badges.mjs`.

Arquivos:
- `scripts/paddle_detect_blur.py` — detecção (PaddleOCR) + blur (Pillow), roda
  como subprocesso. Só image-in, image-out.
- `scripts/game-badges.mjs` — orquestra Firestore + Vercel Blob, chama o
  Python. Comandos: `generate` (CI), `review`/`publish`/`status` (local).
- `.github/workflows/game-badges.yml` — roda `generate` semanalmente.

## Setup local (uma vez)

```bash
python3 -m venv .venv
.venv/bin/pip install --upgrade pip setuptools
.venv/bin/pip install -r scripts/requirements.txt
```

Python 3.12+ não vem com `setuptools` no venv por padrão — sem isso o import
do `paddle` quebra com `ModuleNotFoundError: No module named 'setuptools'`
(já está listado em `scripts/requirements.txt`, mas o `pip install --upgrade
pip` sozinho não resolve, precisa instalar `setuptools` explicitamente antes
ou junto).

Teste que a instalação funcionou (baixa os modelos do PaddleOCR na primeira
vez, ~50-100MB, hospedados em `paddleocr.bj.bcebos.com` — um CDN chinês; se
sua rede bloquear esse host o download trava/tenta pra sempre sem erro
claro, é a causa mais provável de qualquer travamento aqui):

```bash
.venv/bin/python -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='en')"
```

`.env.local` precisa de `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY` (mesmas do `api/`, pegue com `vercel env pull
.env.local` se tiver o projeto linkado) e `BLOB_READ_WRITE_TOKEN` — ver seção
seguinte, esse token não é permanente.

## Token do Vercel Blob (expira em no máximo 7 dias)

Esse projeto usa autenticação OIDC no Blob, não existe mais um
`BLOB_READ_WRITE_TOKEN` fixo salvo nas env vars da Vercel. Pra rodar
`review`/`publish` localmente, gere um token novo antes de cada sessão:

```bash
vercel blob signed-token --pathname "*" --operation put --operation get --valid-for 7d --json
```

Copie o campo `"token"` do JSON de saída pro `.env.local` como
`BLOB_READ_WRITE_TOKEN=...` (NUNCA imprima esse token em logs/conversas —
é uma credencial de escrita, mesmo que de curta duração).

Detalhes que travaram na primeira tentativa, caso reapareçam:
- `--pathname` não aceita glob (`badges/teams/*` falha) — só path exato ou
  `"*"` (a loja inteira). Como a loja só tem escudos deste projeto, `"*"` é
  aceitável.
- Rodar `vercel blob signed-token` localmente sempre usa o contexto
  "development" da CLI, e o OIDC desse projeto só está habilitado pra
  "preview"/"production" — por isso o comando acima funciona (ele NÃO
  depende de OIDC quando `VERCEL_OIDC_TOKEN`/`BLOB_STORE_ID` estão *unset*;
  só exporte essas duas vars se for reproduzir o erro "OIDC is enabled... but
  not for development", o que não deve ser necessário no fluxo normal).
- `vercel blob list-stores` dá o `BLOB_STORE_ID` completo sem precisar puxar
  env de produção, caso precise dele por algum motivo.

## GitHub Actions (geração automática dos candidatos)

Repo: `darlondjc/flash-shields` → Settings → Secrets and variables → Actions.
Adicionar:

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` —
  mesmos valores do `.env.local`.
- `VERCEL_TOKEN` — token de conta de longa duração, criar em
  vercel.com/account/tokens. O workflow usa ele pra mintar um
  `BLOB_READ_WRITE_TOKEN` de 1 dia a cada execução (não dá pra guardar um
  token de Blob fixo como secret, o máximo são 7 dias).
- `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — não são secretos (estão em
  `.vercel/project.json`), mas guarde como secret mesmo assim por
  simplicidade.

O workflow roda toda segunda-feira 09:00 UTC (três horas depois do sync
semanal da Vercel, `vercel.json`), ou manualmente via aba Actions → "Generate
game badge candidates" → Run workflow.

Ele só grava campos "candidato" no Firestore (`badgeGameCandidateUrl`,
`badgeGameCandidateSourceUrl`) — nunca toca no `badgeGameUrl` real. Isso é
proposital: a revisão manual continua obrigatória antes de publicar.

## Uso normal (depois do setup)

```bash
# 1. CI já rodou (ou rode manualmente: node scripts/game-badges.mjs generate)

# 2. Gerar um token de Blob fresco (válido 7 dias) e colar em .env.local
vercel blob signed-token --pathname "*" --operation put --operation get --valid-for 7d --json

# 3. Baixar candidatos novos e montar a galeria de revisão
node scripts/game-badges.mjs review
# abrir game-badge-review/review.html — apagar o game.png dos que ficaram ruins

# 4. Publicar os aprovados
node scripts/game-badges.mjs publish

# Resumo do andamento a qualquer momento
node scripts/game-badges.mjs status
```

Todos os comandos aceitam `--limit N`, `--only <teamId>`, `--force`.

## Por que PaddleOCR e não Tesseract/Gemini

- **Tesseract.js** (client-side, tentativa anterior): falhava em ~95% dos
  casos reais, mesmo depois de corrigir texto curvo/branco-sobre-cor — fonte
  estilizada de escudo é difícil demais pro Tesseract em geral.
- **Gemini image-edit** (`question-badges.mjs`, usado hoje só na Study):
  também não funcionou bem o suficiente quando testado pro caso dos Jogos.
- **PaddleOCR** roda fora do navegador (sem limite de tamanho de bundle tipo
  Vercel Function), detecta texto em qualquer orientação nativamente (sem
  precisar do hack de desenrolar a borda circular que o Tesseract exigiu), e
  já tem alta taxa de acerto em texto de cena/estilizado por padrão.
