import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { League } from '../models/league.model';
import { Team } from '../models/team.model';
import { Deck } from '../models/deck.model';
import { ReviewState } from '../models/review-state.model';
import { Session } from '../models/session.model';

export interface StoredReviewState extends ReviewState {
  id: string;
}

export interface StoredBadgeBlob {
  key: string;
  blob: Blob;
}

@Injectable({ providedIn: 'root' })
export class DbService extends Dexie {
  leagues!: Table<League, string>;
  teams!: Table<Team, string>;
  decks!: Table<Deck, string>;
  reviewStates!: Table<StoredReviewState, string>;
  badgeBlobs!: Table<StoredBadgeBlob, string>;
  sessions!: Table<Session, string>;

  constructor() {
    super('flash-shields');
    this.version(1).stores({
      leagues: 'id',
      teams: 'id, *leagueIds',
      decks: 'id',
      reviewStates: 'id, deckId, dueDate',
      badgeBlobs: 'key',
    });
    this.version(2).stores({
      sessions: 'id, deckId, mode, startedAt',
    });
    // Bumping the version number alone would NOT clear old rows — Dexie only
    // recreates indexes when the schema string changes, and this one hasn't.
    // The explicit .upgrade() is what actually discards the SM-2-shaped rows
    // (repetitions/easeFactor/intervalDays) that don't carry the new `level`
    // field, which would otherwise crash the app at runtime.
    this.version(3).stores({
      reviewStates: 'id, deckId, dueDate',
    }).upgrade(tx => tx.table('reviewStates').clear());
  }

  async upsertTeam(team: Team): Promise<void> {
    const existing = await this.teams.get(team.id);
    if (!existing) {
      await this.teams.put(team);
      return;
    }
    const mergedLeagueIds = Array.from(new Set([...existing.leagueIds, ...team.leagueIds]));
    await this.teams.put({ ...existing, ...team, leagueIds: mergedLeagueIds });
  }
}
