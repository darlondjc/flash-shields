import type { VercelRequest, VercelResponse } from '../_lib/http-types';
import { runSync } from '../_lib/sync';

// A Vercel injeta automaticamente "Authorization: Bearer <CRON_SECRET>" em
// chamadas originadas pelo Vercel Cron quando a env var CRON_SECRET está
// configurada no projeto. Validar aqui impede que alguém dispare o sync (e
// gaste o rate limit da TheSportsDB / billing do Firebase) só de saber a URL.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expected = process.env['CRON_SECRET'];
  if (!expected || req.headers['authorization'] !== `Bearer ${expected}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const result = await runSync();
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}
