// Gera variantes "pergunta" dos escudos (sem o nome do time escrito na arte),
// pra tela de estudo e os jogos não entregarem a resposta.
//
// Fluxo em quatro passos, todos idempotentes e re-executáveis:
//
//   node scripts/question-badges.mjs scan       # classifica quais escudos têm nome legível (Gemini vision)
//   node scripts/question-badges.mjs generate   # gera a variante sem nome pros flagados (Gemini image editing)
//   -> revisão manual: abrir badge-review/review.html e APAGAR o question.png dos que ficaram ruins
//   node scripts/question-badges.mjs publish    # sobe os aprovados pro Vercel Blob + grava badgeQuestionUrl no Firestore
//   node scripts/question-badges.mjs status     # resumo do andamento
//
// Flags: --limit N (processa só N times), --only <externalId> (um time só),
//        --force (re-processa mesmo quem já tem resultado).
//
// Env (lidas de .env.local / .env.production.local / ambiente):
//   GEMINI_API_KEY          scan + generate
//   FIREBASE_*              todos os passos (mesmas vars do api/)
//   BLOB_READ_WRITE_TOKEN   publish
//
// O estado fica em badge-review/ (fora do git): manifest.json + uma pasta por
// time com original.png e question.png. O sync semanal não toca nas variantes:
// elas vivem em paths próprios no Blob (badges/teams/<id>-question.png) e o
// sync grava o doc do time com merge, preservando badgeQuestionUrl.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REVIEW_DIR = join(ROOT, 'badge-review');
const MANIFEST_PATH = join(REVIEW_DIR, 'manifest.json');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/interactions';
// Modelos vigentes em jul/2026 (docs ai.google.dev). Sobrescreva por env se a
// Google descontinuar algum.
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? 'gemini-3.5-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3.1-flash-image';

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
      // Não sobrescreve o que já veio do ambiente (ambiente ganha do arquivo,
      // e .env.local ganha de .env.production.local pela ordem do loop).
      // Valor vazio não conta: vars sensíveis vêm como "" no `vercel env pull`
      // e ocupariam o lugar sem servir pra nada.
      if (value && !(match[1] in process.env)) process.env[match[1]] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Env var obrigatória ausente: ${name}`);
    console.error('Defina no ambiente ou em .env.local na raiz do projeto.');
    process.exit(1);
  }
  return value;
}

async function getDb() {
  const { cert, getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  // Preferência: FIREBASE_SERVICE_ACCOUNT apontando pro JSON baixado do
  // console do Firebase (Configurações do projeto > Contas de serviço >
  // Gerar nova chave privada). Evita colar a private key com \n escapado.
  // Fallback: o trio FIREBASE_* usado pelo api/ na Vercel.
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

// ---------------------------------------------------------------- gemini

async function geminiInteraction(body, apiKey) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(GEMINI_BASE, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) return response.json();
    const text = await response.text();
    // 429/5xx são transitórios (rate limit da free tier, sobretudo); o resto
    // é erro de verdade e repetir não ajuda.
    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      const waitMs = Math.min(60_000, 2 ** attempt * 2000);
      console.log(`  Gemini ${response.status}, tentando de novo em ${waitMs / 1000}s...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`Gemini ${response.status}: ${text.slice(0, 300)}`);
  }
}

function modelOutputBlocks(interaction) {
  return (interaction.steps ?? [])
    .filter(step => step.type === 'model_output')
    .flatMap(step => step.content ?? []);
}

function outputText(interaction) {
  return modelOutputBlocks(interaction)
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');
}

function outputImage(interaction) {
  const block = modelOutputBlocks(interaction).find(b => b.type === 'image' && b.data);
  return block ? Buffer.from(block.data, 'base64') : null;
}

async function downloadBadge(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// ---------------------------------------------------------------- scan

const CLASSIFY_PROMPT = `You are looking at a soccer team badge/crest. Answer strictly as JSON, no markdown fences.

Does the badge contain the team's name (or an obvious readable abbreviation/wordmark of it) written as text that a person could read to identify the team?

Ignore: founding years, mottos in latin, city names alone are borderline (count them only if they are the common way the club is known), decorative letters too small or stylized to read at flashcard size.

Respond: {"has_name": true|false, "text_seen": "<the readable text, or empty string>"}`;

async function scan(flags) {
  const apiKey = requireEnv('GEMINI_API_KEY');
  const db = await getDb();
  const manifest = loadManifest();

  const snapshot = await db.collection('teams').get();
  let teams = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(team => team.badgeUrl);
  if (flags.only) teams = teams.filter(team => team.id === flags.only);
  if (!flags.force) {
    teams = teams.filter(team => !manifest.teams[team.id]?.scannedAt && !team.badgeQuestionUrl);
  }
  teams = teams.slice(0, flags.limit === Infinity ? teams.length : flags.limit);
  console.log(`Escaneando ${teams.length} escudos com ${TEXT_MODEL}...`);

  let flagged = 0;
  for (const [index, team] of teams.entries()) {
    try {
      const badge = await downloadBadge(team.badgeUrl);
      const interaction = await geminiInteraction(
        {
          model: TEXT_MODEL,
          input: [
            { type: 'text', text: CLASSIFY_PROMPT },
            { type: 'image', mime_type: 'image/png', data: badge.toString('base64') },
          ],
        },
        apiKey,
      );
      const raw = outputText(interaction).replace(/```json|```/g, '').trim();
      const verdict = JSON.parse(raw);

      manifest.teams[team.id] = {
        ...manifest.teams[team.id],
        name: team.name,
        badgeUrl: team.badgeUrl,
        hasName: !!verdict.has_name,
        textSeen: verdict.text_seen ?? '',
        scannedAt: new Date().toISOString(),
      };
      if (verdict.has_name) {
        flagged++;
        const dir = join(REVIEW_DIR, team.id);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'original.png'), badge);
      }
      console.log(
        `[${index + 1}/${teams.length}] ${team.name}: ${verdict.has_name ? `TEM NOME ("${verdict.text_seen}")` : 'ok'}`,
      );
      saveManifest(manifest);
    } catch (err) {
      console.error(`[${index + 1}/${teams.length}] ${team.name}: ERRO ${err.message}`);
    }
  }
  console.log(`\nScan concluído: ${flagged} escudos flagados nesta rodada.`);
  writeGallery(manifest);
  console.log('Próximo passo: node scripts/question-badges.mjs generate');
}

// ---------------------------------------------------------------- generate

const EDIT_PROMPT = `Edit this soccer team badge: remove ALL readable text and lettering (team name, wordmark, abbreviations) from the badge. Keep every other element exactly as it is - same shapes, same colors, same emblem, same composition, same style. Where the text was, continue the underlying background/pattern naturally. Do not add anything new. Output only the edited badge on a plain white background, same framing as the input.`;

async function generate(flags) {
  const apiKey = requireEnv('GEMINI_API_KEY');
  const manifest = loadManifest();

  let entries = Object.entries(manifest.teams).filter(([, entry]) => entry.hasName);
  if (flags.only) entries = entries.filter(([id]) => id === flags.only);
  if (!flags.force) entries = entries.filter(([, entry]) => !entry.generatedAt);
  entries = entries.slice(0, flags.limit === Infinity ? entries.length : flags.limit);
  console.log(`Gerando variante pra ${entries.length} escudos com ${IMAGE_MODEL}...`);

  let sharp = null;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn(
      'Aviso: "sharp" não instalado (npm i -D sharp). Sem ele a variante sai com fundo\n' +
        'opaco em vez de herdar a transparência do original, o que fica ruim no tema escuro.',
    );
  }

  for (const [index, [id, entry]] of entries.entries()) {
    try {
      const originalPath = join(REVIEW_DIR, id, 'original.png');
      const original = existsSync(originalPath) ? readFileSync(originalPath) : await downloadBadge(entry.badgeUrl);

      const interaction = await geminiInteraction(
        {
          model: IMAGE_MODEL,
          input: [
            { type: 'text', text: EDIT_PROMPT },
            { type: 'image', mime_type: 'image/png', data: original.toString('base64') },
          ],
        },
        apiKey,
      );
      let generated = outputImage(interaction);
      if (!generated) throw new Error(`modelo não devolveu imagem (${outputText(interaction).slice(0, 120)})`);

      // O modelo devolve fundo opaco. Reaplicar o canal alfa do original
      // devolve a silhueta exata do escudo (a edição não muda o contorno, só o
      // conteúdo). Casos onde o nome ficava FORA do contorno sobram como uma
      // mancha clara com o formato do texto - a revisão manual pega esses.
      if (sharp) {
        const { width, height } = await sharp(original).metadata();
        const alpha = await sharp(original).ensureAlpha().extractChannel('alpha').raw().toBuffer();
        // Em dois passos: removeAlpha e joinChannel no mesmo pipeline se
        // atropelam (o sharp aplica operações em estágios fixos, e a remoção
        // ganha da junção).
        const rgb = await sharp(generated).resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
        generated = await sharp(rgb, { raw: { width, height, channels: 3 } })
          .joinChannel(alpha, { raw: { width, height, channels: 1 } })
          .png()
          .toBuffer();
      }

      const dir = join(REVIEW_DIR, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'original.png'), original);
      writeFileSync(join(dir, 'question.png'), generated);
      entry.generatedAt = new Date().toISOString();
      delete entry.publishedAt;
      saveManifest(manifest);
      console.log(`[${index + 1}/${entries.length}] ${entry.name}: variante gerada`);
    } catch (err) {
      console.error(`[${index + 1}/${entries.length}] ${entry.name}: ERRO ${err.message}`);
    }
  }
  writeGallery(manifest);
  console.log('\nRevise em badge-review/review.html — apague o question.png dos que ficaram ruins.');
  console.log('Depois: node scripts/question-badges.mjs publish');
}

// ---------------------------------------------------------------- publish

async function publish(flags) {
  const token = requireEnv('BLOB_READ_WRITE_TOKEN');
  const { put } = await import('@vercel/blob');
  const db = await getDb();
  const manifest = loadManifest();

  let entries = Object.entries(manifest.teams).filter(([, entry]) => entry.hasName && entry.generatedAt);
  if (flags.only) entries = entries.filter(([id]) => id === flags.only);
  if (!flags.force) entries = entries.filter(([, entry]) => !entry.publishedAt);

  let published = 0;
  let skipped = 0;
  for (const [id, entry] of entries) {
    const questionPath = join(REVIEW_DIR, id, 'question.png');
    if (!existsSync(questionPath)) {
      // question.png apagado na revisão = variante rejeitada. Fica de fora até
      // alguém rodar generate --only <id> de novo.
      skipped++;
      continue;
    }
    const blob = await put(`badges/teams/${id}-question.png`, readFileSync(questionPath), {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
      allowOverwrite: true,
      token,
    });
    await db.collection('teams').doc(id).set({ badgeQuestionUrl: blob.url }, { merge: true });
    entry.publishedAt = new Date().toISOString();
    entry.badgeQuestionUrl = blob.url;
    saveManifest(manifest);
    published++;
    console.log(`${entry.name}: ${blob.url}`);
  }
  console.log(`\nPublicados: ${published} · rejeitados/pulados: ${skipped}`);
  if (published > 0) {
    console.log('Devices já importados recebem o campo novo via "Atualizar dados importados" em Configurações.');
  }
}

// ---------------------------------------------------------------- status / galeria

function status() {
  const manifest = loadManifest();
  const entries = Object.values(manifest.teams);
  const flagged = entries.filter(entry => entry.hasName);
  console.log(`Escaneados: ${entries.length}`);
  console.log(`Com nome no escudo: ${flagged.length}`);
  console.log(`Variante gerada: ${flagged.filter(entry => entry.generatedAt).length}`);
  console.log(`Publicados: ${flagged.filter(entry => entry.publishedAt).length}`);
}

function writeGallery(manifest) {
  const rows = Object.entries(manifest.teams)
    .filter(([, entry]) => entry.hasName)
    .map(([id, entry]) => {
      const hasQuestion = existsSync(join(REVIEW_DIR, id, 'question.png'));
      return `<figure>
        <div class="pair">
          <img src="${id}/original.png" alt="original">
          ${hasQuestion ? `<img src="${id}/question.png" alt="variante">` : '<div class="missing">sem variante</div>'}
        </div>
        <figcaption><strong>${entry.name}</strong><br><code>${id}</code> · viu: "${entry.textSeen}"${entry.publishedAt ? ' · <b>publicado</b>' : ''}</figcaption>
      </figure>`;
    })
    .join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Revisão de escudos</title>
<style>
  body { font-family: system-ui; background: #222; color: #eee; padding: 1rem; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
  figure { margin: 0; background: #333; border-radius: 8px; padding: 0.75rem; }
  .pair { display: flex; gap: 0.5rem; background: repeating-conic-gradient(#555 0% 25%, #444 0% 50%) 0 0 / 16px 16px; border-radius: 6px; }
  .pair img, .missing { width: 50%; aspect-ratio: 1; object-fit: contain; }
  .missing { display: grid; place-items: center; color: #999; font-size: 0.8rem; }
  figcaption { font-size: 0.8rem; margin-top: 0.5rem; }
</style>
<p>Esquerda: original · Direita: variante gerada. Pra rejeitar uma variante, apague o <code>question.png</code> da pasta do time e rode <code>publish</code>.</p>
<main>${rows}</main>`;
  writeFileSync(join(REVIEW_DIR, 'review.html'), html);
}

// ---------------------------------------------------------------- main

loadEnv();
const { command, flags } = parseArgs();
const commands = { scan, generate, publish, status };
if (!commands[command]) {
  console.log('Uso: node scripts/question-badges.mjs <scan|generate|publish|status> [--limit N] [--only id] [--force]');
  process.exit(1);
}
await commands[command](flags);
