import 'fake-indexeddb/auto';
import Dexie from 'dexie';

// Mirrors DbService's version chain under a database name of its own, so this
// test can freely open/close/delete without disturbing the shared
// 'flash-shields' instance other spec files keep open for the whole run.
// Keep this in sync with db.service.ts's version(1)/(2)/(3) definitions.
const DB_NAME = 'flash-shields-migration-test';

function openLegacyShapedDb(): Dexie {
  const db = new Dexie(DB_NAME);
  db.version(1).stores({
    leagues: 'id',
    teams: 'id, *leagueIds',
    decks: 'id',
    reviewStates: 'id, deckId, dueDate',
    badgeBlobs: 'key',
  });
  db.version(2).stores({ sessions: 'id, deckId, mode, startedAt' });
  return db;
}

function openUpgradedDb(): Dexie {
  const db = openLegacyShapedDb();
  db.version(3)
    .stores({ reviewStates: 'id, deckId, dueDate' })
    .upgrade(tx => tx.table('reviewStates').clear());
  return db;
}

describe('Dexie migration to v3 (mirrors DbService)', () => {
  afterEach(async () => {
    await Dexie.delete(DB_NAME);
  });

  it('clears reviewStates left over from the SM-2 schema when upgrading to the level-based schema', async () => {
    const legacy = openLegacyShapedDb();
    await legacy.open();
    await legacy.table('reviewStates').put({
      id: 'deck-1:ts-1',
      teamId: 'ts-1',
      deckId: 'deck-1',
      repetitions: 2,
      easeFactor: 2.5,
      intervalDays: 6,
      dueDate: '2026-01-01',
      lapses: 0,
      suspended: false,
    });
    legacy.close();

    const upgraded = openUpgradedDb();
    await upgraded.open();

    const remaining = await upgraded.table('reviewStates').toArray();
    expect(remaining).toHaveLength(0);
    upgraded.close();
  });
});
