import type { VercelRequest, VercelResponse } from '../_lib/http-types';
import { getDb } from '../_lib/firebase-admin';
import { ImportedTeam } from '../../src/app/core/data/data-source.adapter';

const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const leagueId = typeof req.query['leagueId'] === 'string' ? req.query['leagueId'] : undefined;
  if (!leagueId) {
    res.status(400).json({ error: 'leagueId query param is required' });
    return;
  }

  const db = getDb();
  const snapshot = await db.collection('teams').where('leagueIds', 'array-contains', leagueId).get();

  const teams: ImportedTeam[] = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      externalId: doc.id,
      name: data['name'],
      shortName: data['shortName'] ?? undefined,
      alternateNames: data['alternateNames'] ?? [],
      country: data['country'] ?? '',
      badgeUrl: data['badgeUrl'] ?? '',
      badgeQuestionUrl: data['badgeQuestionUrl'] ?? undefined,
      founded: data['founded'] ?? undefined,
      stadium: data['stadium'] ?? undefined,
      website: data['website'] ?? undefined,
    };
  });

  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.status(200).json(teams);
}
