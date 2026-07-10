import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './firebase-admin';
import { createThesportsdbGet } from './thesportsdb-client';
import { uploadBadge } from './badge-storage';
import { fetchLeagueDetails, fetchTeamsForLeague } from '../../src/app/core/data/thesportsdb-scraper';
import { LEAGUES_TO_IMPORT } from '../../src/app/core/data/league-import.config';
import { currentSeason } from '../../src/app/core/data/season';

export interface SyncResult {
  leaguesSynced: number;
  teamsUpserted: number;
  errors: string[];
}

// Raspa todas as ligas curadas (exceto comingSoon, que não têm elenco pra
// importar — mesmo filtro usado hoje em app-init.service.ts/search.ts no
// client) e grava o resultado no Firestore + Vercel Blob. Roda uma única vez
// por disparo do cron, não por usuário.
export async function runSync(): Promise<SyncResult> {
  const startedAt = new Date();
  const db = getDb();
  const get = createThesportsdbGet();

  const result: SyncResult = { leaguesSynced: 0, teamsUpserted: 0, errors: [] };
  const configs = LEAGUES_TO_IMPORT.filter(config => !config.comingSoon);

  for (const config of configs) {
    try {
      const details = await fetchLeagueDetails(get, config.externalId);
      const badgeUrl = await uploadBadge(`badges/leagues/${config.externalId}.png`, details.badgeUrl);

      await db.collection('leagues').doc(config.externalId).set({
        name: config.name,
        country: config.country,
        regionId: config.regionId,
        sport: 'soccer',
        badgeSourceUrl: details.badgeUrl ?? null,
        badgeUrl: badgeUrl ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const teams = await fetchTeamsForLeague(get, config.externalId, currentSeason(config.regionId));

      for (const team of teams) {
        const teamBadgeUrl = await uploadBadge(`badges/teams/${team.externalId}.png`, team.badgeUrl);

        await db.collection('teams').doc(team.externalId).set(
          {
            name: team.name,
            shortName: team.shortName ?? null,
            alternateNames: team.alternateNames,
            country: team.country,
            badgeSourceUrl: team.badgeUrl || null,
            badgeUrl: teamBadgeUrl ?? null,
            founded: team.founded ?? null,
            stadium: team.stadium ?? null,
            website: team.website ?? null,
            leagueIds: FieldValue.arrayUnion(config.externalId),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        result.teamsUpserted++;
      }

      result.leaguesSynced++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${config.name} (${config.externalId}): ${message}`);
    }
  }

  await db.collection('syncRuns').add({
    startedAt,
    finishedAt: FieldValue.serverTimestamp(),
    leaguesSynced: result.leaguesSynced,
    teamsUpserted: result.teamsUpserted,
    errors: result.errors,
  });

  return result;
}
