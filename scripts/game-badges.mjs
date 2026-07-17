// Gera variantes "jogo" dos escudos (nome do time borrado, não removido —
// ver por quê no comentário de EDIT abaixo), pros modos Múltipla escolha e
// Reverso não entregarem a resposta.
//
// Diferente de question-badges.mjs (que reescreve o escudo inteiro via
// Gemini), aqui a detecção do texto é feita pelo PaddleOCR — mais confiável
// pra nomes em curva/estilizados, mas exige Python (não roda no navegador).
// Por isso o fluxo é partido em duas metades:
//
//   generate  → roda em CI (GitHub Actions, agendado) sobre QUALQUER time
//               com escudo novo/alterado. Só grava um campo "candidato",
//               nunca publica direto.
//   review    → roda local: baixa os candidatos novos, gera uma galeria HTML
//               comparando original x borrado (game-badge-review/review.html).
//               Apague o game.png dos que ficaram ruins.
//   publish   → roda local: promove os candidatos aprovados (que sobraram
//               com game.png) pro campo real badgeGameUrl.
//   status    → resumo do andamento.
//
// Todos os passos são idempotentes e re-executáveis. Flags: --limit N,
// --only <teamId>, --force (reprocessa mesmo quem já está em dia).
//
// Env (lidas de .env.local / .env.production.local / ambiente):
//   FIREBASE_*              todos os passos (mesmas vars do api/)
//   BLOB_READ_WRITE_TOKEN   generate + publish
//
// O estado local fica em game-badge-review/ (fora do git, adicionar ao
// .gitignore junto com badge-review/): manifest.json + original.png/game.png
// por time. O campo "candidato" no Firestore é que faz o generate ser
// idempotente entre execuções do CI (runners são efêmeros, sem estado local).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REVIEW_DIR = join(ROOT, 'game-badge-review');
const MANIFEST_PATH = join(REVIEW_DIR, 'manifest.json');
const DETECT_SCRIPT = join(ROOT, 'scripts', 'paddle_detect_blur.py');
const PYTHON_BIN = process.env.PYTHON_BIN ?? 'python3';

// ---------------------------------------------------------------- env / setup

function loadEnv() {
  for (const file of ['.env.local', '.env.production.local']) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (value && !(match[1] in process.env)) process.env[match[1]] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Env var obrigatória ausente: ${name}`);
    console.error('Defina no ambiente, em .env.local na raiz do projeto, ou como secret do GitHub Actions.');
    process.exit(1);
  }
  return value;
}

async function getDb() {
  const { cert, getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  let credentials;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountPath) {
    if (!existsSync(serviceAccountPath)) {
      console.error(`FIREBASE_SERVICE_ACCOUNT aponta pra um arquivo que não existe: ${serviceAccountPath}`);
      process.exit(1);
    }
    const json = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    credentials = { projectId: json.project_id, clientEmail: json.client_email, privateKey: json.private_key };
  } else {
    credentials = {
      projectId: requireEnv('FIREBASE_PROJECT_ID'),
      clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
      privateKey: requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    };
  }

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  return getFirestore(app);
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return { teams: {} };
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function saveManifest(manifest) {
  mkdirSync(REVIEW_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = { limit: Infinity, only: null, force: false };
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--limit') flags.limit = Number(args[++i]);
    else if (args[i] === '--only') flags.only = args[++i];
    else if (args[i] === '--force') flags.force = true;
  }
  return { command, flags };
}

async function downloadBadge(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// ---------------------------------------------------------------- generate

// Runs in CI. For every team whose current badgeUrl hasn't been through
// PaddleOCR yet (or changed since it last was), detect+blur via the Python
// subprocess and stash the result as a *candidate* — never touches the real
// badgeGameUrl field, so this can run unattended on a schedule without a
// human approving anything mid-run.
async function generate(flags) {
  const { put } = await import('@vercel/blob');
  const db = await getDb();

  const snapshot = await db.collection('teams').get();
  let teams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(team => team.badgeUrl);
  if (flags.only) teams = teams.filter(team => team.id === flags.only);
  if (!flags.force) {
    teams = teams.filter(team => team.badgeGameCandidateSourceUrl !== team.badgeUrl);
  }
  teams = teams.slice(0, flags.limit === Infinity ? teams.length : flags.limit);
  console.log(`Processando ${teams.length} escudos com PaddleOCR...`);

  let withText = 0;
  let clean = 0;
  for (const [index, team] of teams.entries()) {
    const label = `[${index + 1}/${teams.length}] ${team.name ?? team.id}`;
    try {
      const badge = await downloadBadge(team.badgeUrl);
      const inputPath = join(tmpdir(), `game-badge-in-${team.id}.png`);
      const outputPath = join(tmpdir(), `game-badge-out-${team.id}.png`);
      writeFileSync(inputPath, badge);

      const raw = execFileSync(PYTHON_BIN, [DETECT_SCRIPT, inputPath, outputPath], { encoding: 'utf8' });
      const { regionsFound } = JSON.parse(raw.trim().split('\n').pop());

      if (regionsFound === 0) {
        clean++;
        await db.collection('teams').doc(team.id).set(
          { badgeGameCandidateSourceUrl: team.badgeUrl, badgeGameCandidateUrl: null },
          { merge: true },
        );
        console.log(`${label}: sem texto detectado`);
        continue;
      }

      withText++;
      const blob = await put(`badges/teams/${team.id}-game-candidate.png`, readFileSync(outputPath), {
        access: 'public',
        contentType: 'image/png',
        addRandomSuffix: false,
        allowOverwrite: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      await db.collection('teams').doc(team.id).set(
        { badgeGameCandidateSourceUrl: team.badgeUrl, badgeGameCandidateUrl: blob.url },
        { merge: true },
      );
      console.log(`${label}: ${regionsFound} região(ões) borrada(s) → ${blob.url}`);
    } catch (err) {
      console.error(`${label}: ERRO ${err.message}`);
    }
  }
  console.log(`\nConcluído: ${withText} com texto borrado, ${clean} sem texto detectado.`);
  console.log('Próximo passo (local): node scripts/game-badges.mjs review');
}

// ---------------------------------------------------------------- review

async function review(flags) {
  const db = await getDb();
  const manifest = loadManifest();

  const snapshot = await db.collection('teams').get();
  let teams = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(team => team.badgeGameCandidateUrl);
  if (flags.only) teams = teams.filter(team => team.id === flags.only);
  if (!flags.force) {
    teams = teams.filter(team => manifest.teams[team.id]?.candidateUrl !== team.badgeGameCandidateUrl);
  }
  teams = teams.slice(0, flags.limit === Infinity ? teams.length : flags.limit);
  console.log(`Baixando ${teams.length} candidato(s) novo(s) pra revisão...`);

  for (const [index, team] of teams.entries()) {
    try {
      const [original, candidate] = await Promise.all([
        downloadBadge(team.badgeUrl),
        downloadBadge(team.badgeGameCandidateUrl),
      ]);
      const dir = join(REVIEW_DIR, team.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'original.png'), original);
      writeFileSync(join(dir, 'game.png'), candidate);
      manifest.teams[team.id] = {
        name: team.name,
        candidateUrl: team.badgeGameCandidateUrl,
        candidateSourceUrl: team.badgeGameCandidateSourceUrl,
        downloadedAt: new Date().toISOString(),
      };
      saveManifest(manifest);
      console.log(`[${index + 1}/${teams.length}] ${team.name}: baixado`);
    } catch (err) {
      console.error(`[${index + 1}/${teams.length}] ${team.name}: ERRO ${err.message}`);
    }
  }
  writeGallery(manifest);
  console.log('\nRevise em game-badge-review/review.html — apague o game.png dos que ficaram ruins.');
  console.log('Depois: node scripts/game-badges.mjs publish');
}

// ---------------------------------------------------------------- publish

async function publish(flags) {
  const { put } = await import('@vercel/blob');
  const db = await getDb();
  const manifest = loadManifest();

  let entries = Object.entries(manifest.teams);
  if (flags.only) entries = entries.filter(([id]) => id === flags.only);
  if (!flags.force) entries = entries.filter(([, entry]) => !entry.publishedAt);

  let published = 0;
  let rejected = 0;
  for (const [id, entry] of entries) {
    const gamePath = join(REVIEW_DIR, id, 'game.png');
    if (!existsSync(gamePath)) {
      // game.png apagado na revisão = variante rejeitada.
      rejected++;
      continue;
    }

    // A doc pode ter recebido um candidato mais novo desde o último review()
    // local — não publica por cima de algo que ninguém revisou ainda.
    const doc = await db.collection('teams').doc(id).get();
    if (doc.data()?.badgeGameCandidateUrl !== entry.candidateUrl) {
      console.log(`${entry.name}: candidato mudou desde a revisão, pulei — rode review de novo`);
      continue;
    }

    const blob = await put(`badges/teams/${id}-game.png`, readFileSync(gamePath), {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    await db.collection('teams').doc(id).set({ badgeGameUrl: blob.url }, { merge: true });
    entry.publishedAt = new Date().toISOString();
    entry.badgeGameUrl = blob.url;
    saveManifest(manifest);
    published++;
    console.log(`${entry.name}: ${blob.url}`);
  }
  console.log(`\nPublicados: ${published} · rejeitados/pulados: ${rejected}`);
  if (published > 0) {
    console.log('Devices já importados recebem o campo novo via "Atualizar dados importados" em Configurações.');
  }
}

// ---------------------------------------------------------------- status / galeria

function status() {
  const manifest = loadManifest();
  const entries = Object.values(manifest.teams);
  console.log(`Candidatos baixados pra revisão: ${entries.length}`);
  console.log(`Aprovados e publicados: ${entries.filter(entry => entry.publishedAt).length}`);
}

function writeGallery(manifest) {
  const rows = Object.entries(manifest.teams)
    .map(([id, entry]) => {
      const hasGame = existsSync(join(REVIEW_DIR, id, 'game.png'));
      return `<figure>
        <div class="pair">
          <img src="${id}/original.png" alt="original">
          ${hasGame ? `<img src="${id}/game.png" alt="borrado">` : '<div class="missing">rejeitado</div>'}
        </div>
        <figcaption><strong>${entry.name}</strong><br><code>${id}</code>${entry.publishedAt ? ' · <b>publicado</b>' : ''}</figcaption>
      </figure>`;
    })
    .join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Revisão de escudos (jogo)</title>
<style>
  body { font-family: system-ui; background: #222; color: #eee; padding: 1rem; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
  figure { margin: 0; background: #333; border-radius: 8px; padding: 0.75rem; }
  .pair { display: flex; gap: 0.5rem; background: repeating-conic-gradient(#555 0% 25%, #444 0% 50%) 0 0 / 16px 16px; border-radius: 6px; }
  .pair img, .missing { width: 50%; aspect-ratio: 1; object-fit: contain; }
  .missing { display: grid; place-items: center; color: #999; font-size: 0.8rem; }
  figcaption { font-size: 0.8rem; margin-top: 0.5rem; }
</style>
<p>Esquerda: original · Direita: nome borrado pelo PaddleOCR. Pra rejeitar, apague o <code>game.png</code> da pasta do time e rode <code>publish</code>.</p>
<main>${rows}</main>`;
  writeFileSync(join(REVIEW_DIR, 'review.html'), html);
}

// ---------------------------------------------------------------- main

loadEnv();
const { command, flags } = parseArgs();

switch (command) {
  case 'generate':
    await generate(flags);
    break;
  case 'review':
    await review(flags);
    break;
  case 'publish':
    await publish(flags);
    break;
  case 'status':
    status();
    break;
  default:
    console.error('Uso: node scripts/game-badges.mjs <generate|review|publish|status> [--limit N] [--only <id>] [--force]');
    process.exit(1);
}
