import type { VercelRequest, VercelResponse } from '../_lib/http-types';
import { getDb } from '../_lib/firebase-admin';

// Cache generoso: dados de liga (nome, escudo) praticamente não mudam entre
// um sync e outro (o cron roda semanalmente), então a CDN edge da Vercel
// pode servir sem re-executar a function na maioria das requisições.
const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800';

interface LeagueDto {
  externalId: string;
  badgeUrl?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getDb();
  res.setHeader('Cache-Control', CACHE_CONTROL);

  const id = typeof req.query['id'] === 'string' ? req.query['id'] : undefined;

  if (id) {
    const doc = await db.collection('leagues').doc(id).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'league not found' });
      return;
    }
    res.status(200).json(toDto(id, doc.data() as FirebaseFirestore.DocumentData));
    return;
  }

  const snapshot = await db.collection('leagues').get();
  const leagues: LeagueDto[] = snapshot.docs.map(doc => toDto(doc.id, doc.data()));
  res.status(200).json(leagues);
}

function toDto(externalId: string, data: FirebaseFirestore.DocumentData): LeagueDto {
  return {
    externalId,
    badgeUrl: data['badgeUrl'] ?? undefined,
  };
}
