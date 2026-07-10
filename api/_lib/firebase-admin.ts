import { cert, getApps, initializeApp, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// Vercel functions podem reaproveitar o mesmo processo entre invocações (warm
// start), então inicializar o Admin SDK mais de uma vez no mesmo processo
// quebra — daí o guard em getApps().length antes de initializeApp. Só
// Firestore aqui: os escudos vão pro Vercel Blob, não pro Firebase Storage
// (que exige o plano Blaze/cartão cadastrado; Firestore funciona no plano
// gratuito Spark).
function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const projectId = requireEnv('FIREBASE_PROJECT_ID');
  const clientEmail = requireEnv('FIREBASE_CLIENT_EMAIL');
  // A chave privada vem da env var com \n escapado (formato que sobrevive a
  // copiar/colar num painel de env vars); precisa desescapar antes de usar.
  const privateKey = requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function getDb(): Firestore {
  return getFirestore(getAdminApp());
}
