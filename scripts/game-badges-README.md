# Pipeline de escudos "jogo" (EasyOCR + inpainting)

Gera uma variante de cada escudo com o nome do time removido e reconstruído,
especificamente pros modos Múltipla escolha e Reverso (`Team.badgeGameUrl`).
Não confundir com `scripts/question-badges.mjs`, que gera `badgeQuestionUrl`
pra Study reescrevendo o escudo inteiro via Gemini — pipeline separado, ver
"Por que EasyOCR" abaixo.

Arquivos:
- `scripts/remove_text.py` — detecção (EasyOCR/CRAFT) + remoção com
  reconstrução do fundo (inpainting via LaMa, com fallback pro OpenCV
  clássico), roda como subprocesso. Só image-in, image-out.
- `scripts/game-badges.mjs` — orquestra Firestore + Vercel Blob, chama o
  Python. Comandos: `generate` (CI), `review`/`publish`/`status` (local).
- `.github/workflows/game-badges.yml` — roda `generate` semanalmente.

## Setup local (uma vez)

```bash
python3 -m venv .venv
.venv/bin/pip install --upgrade pip setuptools
.venv/bin/pip install -r scripts/requirements.txt
```

Instala EasyOCR (detecção), OpenCV/numpy e `simple-lama-inpainting`
(reconstrução do fundo via rede neural). Traz PyTorch como dependência —
instalação bem mais pesada que o antigo PaddleOCR (a wheel padrão do PyPI já
vem com suporte a CUDA embutido, ~2GB somados, mesmo rodando só em CPU no
CI). Se isso virar problema de tempo/espaço em CI, dá pra apontar o pip pro
índice CPU-only do PyTorch (`--extra-index-url
https://download.pytorch.org/whl/cpu`).

Teste que a instalação funcionou (baixa os modelos do EasyOCR/CRAFT na
primeira vez, ~65MB, hospedados em releases do GitHub — diferente do
PaddleOCR, que dependia de um CDN chinês (`paddleocr.bj.bcebos.com`) que
travava nessa rede sem erro claro; esse problema não deve mais acontecer):

```bash
.venv/bin/python -c "from remove_text import get_reader; get_reader()" 2>&1 | tail -5
```
(rode a partir de `scripts/`, ou ajuste o `sys.path`)

`.env.local` precisa de `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY` (mesmas do `api/`) e, pra autenticar no Vercel Blob,
`VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID` (rode `vercel env pull .env.local` com
o projeto linkado — a federação OIDC já está habilitada pro ambiente
Development deste projeto, então isso funciona sem precisar de um token
fixo). Se o OIDC não estiver disponível por algum motivo, `BLOB_READ_WRITE_TOKEN`
gerado via `vercel blob signed-token` continua funcionando como alternativa
(ver comentário em `game-badges.mjs` → `getDb`/`put` sobre a ordem de
prioridade das credenciais).

## GitHub Actions (geração automática dos candidatos)

Repo: `darlondjc/flash-shields` → Settings → Secrets and variables → Actions.
Adicionar:

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` —
  mesmos valores do `.env.local`. Precisam ser secrets do GitHub (não dá pra
  usar os valores da Vercel diretamente: essas três variáveis estão
  marcadas "Sensitive" no dashboard da Vercel, e valores Sensitive nunca são
  legíveis via `vercel env pull`/CLI — só ficam disponíveis dentro do
  runtime da própria Vercel).
- `VERCEL_TOKEN` — token de conta de longa duração, criar em
  vercel.com/account/tokens. O workflow usa ele pra puxar `VERCEL_OIDC_TOKEN`
  + `BLOB_STORE_ID` frescos a cada execução (via `vercel env pull
  --environment=production`), que autenticam no Vercel Blob sem precisar de
  um token fixo.
- `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — não são secretos (estão em
  `.vercel/project.json`), mas guarde como secret mesmo assim por
  simplicidade.

O workflow roda toda segunda-feira 09:00 UTC (três horas depois do sync
semanal da Vercel, `vercel.json`), ou manualmente via aba Actions → "Generate
game badge candidates" → Run workflow (aceita os inputs opcionais `only`
— IDs de time separados por vírgula — e `force`, úteis pra testar mudanças
no script num subconjunto pequeno antes de rodar nos ~230 escudos).

Ele só grava campos "candidato" no Firestore (`badgeGameCandidateUrl`,
`badgeGameCandidateSourceUrl`) — nunca toca no `badgeGameUrl` real. Isso é
proposital: a revisão manual continua obrigatória antes de publicar.

## Uso normal (depois do setup)

```bash
# 1. CI já rodou (ou rode manualmente: node scripts/game-badges.mjs generate)

# 2. Baixar candidatos novos e montar a galeria de revisão
node scripts/game-badges.mjs review
# abrir game-badge-review/review.html — apagar o game.png dos que ficaram ruins

# 3. Publicar os aprovados
node scripts/game-badges.mjs publish

# Resumo do andamento a qualquer momento
node scripts/game-badges.mjs status
```

Todos os comandos aceitam `--limit N`, `--only <teamId1,teamId2,...>`, `--force`.

## Diagnóstico manual de um escudo específico

`scripts/remove_text.py` tem CLI própria pra depurar caso-a-caso, fora do
fluxo do `game-badges.mjs`:

```bash
.venv/bin/python scripts/remove_text.py escudo.png -o limpo.png --debug
# gera limpo_boxes.png (polígonos detectados) e limpo_mask.png (máscara final)
```

Flags úteis pra depuração: `--text-threshold`/`--low-text` (limiares do
detector CRAFT — menores = mais permissivo, mais falso positivo também),
`--engine cv` (força o inpainting clássico do OpenCV em vez do LaMa, mais
rápido pra iterar), `--keep X0,Y0,X1,Y1` (protege uma região — ex: monograma
central — de ser tratada como texto).

## Por que EasyOCR + inpainting, e não PaddleOCR/Tesseract/Gemini

- **Tesseract.js** (client-side, tentativa mais antiga): falhava em ~95% dos
  casos reais, mesmo depois de corrigir texto curvo/branco-sobre-cor — fonte
  estilizada de escudo é difícil demais pro Tesseract em geral.
- **Gemini image-edit** (`question-badges.mjs`, usado hoje só na Study):
  reescreve o escudo inteiro via IA generativa — também não funcionou bem o
  suficiente quando testado pro caso dos Jogos.
- **PaddleOCR + blur** (tentativa anterior deste pipeline): detectava bem
  texto reto/lema, mas o detector simplesmente não enxergava nomes fortemente
  arqueados (ex: "MANCHESTER" na borda de um escudo circular) — testado lado
  a lado em vários escudos reais, mesmo ajustando os parâmetros de detecção.
- **EasyOCR (CRAFT) + inpainting**: usa `reader.detect()` (não `readtext()`)
  pra pegar SÓ a localização do texto, sem depender de reconhecer o que ele
  diz — texto arqueado costuma ser ilegível pro reconhecedor mas ainda assim
  detectável como "tem texto aqui". Comparado lado a lado nos mesmos escudos
  problemáticos do PaddleOCR, capturou o nome inteiro onde o PaddleOCR não
  achava nada, e o resultado é reconstrução do fundo (LaMa) em vez de blur.

**Limitações conhecidas, ainda sem solução completa** (a revisão manual via
`review`/`publish` é a rede de segurança, não uma exceção rara):
- O detector CRAFT ocasionalmente devolve um polígono "engordado" cobrindo
  boa parte do escudo (mitigado com um filtro de sanidade de tamanho, mas
  pode ainda descartar alguma região de texto legítima nesses casos).
- Fontes grandes têm um limite de altura pra distinguir "letra" de "anel/
  emblema" dentro da região detectada — calibrado nos casos testados, mas
  não é infalível pra qualquer fonte.
- Inpainting em áreas pequenas/muito texturizadas/alto contraste às vezes
  deixa um resíduo visível ("fantasma") em vez de reconstrução perfeita.
- Nenhum dos dois detectores (PaddleOCR ou EasyOCR) é 100% confiável em
  todos os escudos — cada um erra em casos diferentes e imprevisíveis.
