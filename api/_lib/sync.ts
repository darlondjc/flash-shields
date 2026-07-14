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

// Times de uma liga eram processados um a um (download do escudo + upload
// pro Blob + write no Firestore), e isso sozinho já estourava o timeout da
// function pra o catálogo inteiro de ligas. Só a chamada JSON à TheSportsDB
// precisa do throttle sequencial (thesportsdb-client.ts); download de escudo
// e Firestore não têm esse limite, então rodam em paralelo com um teto de
// concorrência pra não abrir centenas de conexões de uma vez.
const TEAM_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
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
      // Sincronizar o catálogo inteiro numa invocação só facilmente estoura o
      // timeout da function; sem isso, uma reentrada (retry manual, ou o
      // cron rodando de novo antes de completar) refazia as ligas já
      // sincronizadas do zero e nunca sobrava tempo pra avançar nas
      // seguintes. Pular ligas atualizadas há menos de um dia deixa a
      // reentrada avançar pro que falta, sem abrir mão do refresh semanal.
      const existing = await db.collection('leagues').doc(config.externalId).get();
      const updatedAt = existing.data()?.['updatedAt'] as FirebaseFirestore.Timestamp | undefined;
      if (updatedAt && Date.now() - updatedAt.toMillis() < 24 * 60 * 60 * 1000) {
        result.leaguesSynced++;
        continue;
      }

      const details = await fetchLeagueDetails(get, config.externalId);
      const badgeUrl = await uploadBadge(`badges/leagues/${config.externalId}.png`, details.badgeUrl);

      const teams = await fetchTeamsForLeague(
        get,
        config.externalId,
        config.season ?? currentSeason(config.regionId),
        config.teamNames,
      );

      await mapWithConcurrency(teams, TEAM_CONCURRENCY, async team => {
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
      });

      // O doc da liga (com updatedAt) só é gravado depois dos times: é ele
      // que marca a liga como "fresca" pro skip de 24h acima, e gravar antes
      // fazia um timeout no meio dos times deixar a liga incompleta e ainda
      // assim pulada nas reentradas seguintes.
      await db.collection('leagues').doc(config.externalId).set({
        name: config.name,
        country: config.country,
        regionId: config.regionId,
        sport: 'soccer',
        badgeSourceUrl: details.badgeUrl ?? null,
        badgeUrl: badgeUrl ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      });

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
