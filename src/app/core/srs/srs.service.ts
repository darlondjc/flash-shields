import { Injectable, inject } from '@angular/core';
import { DbService, StoredReviewState } from '../persistence/db.service';
import { DeckService } from '../decks/deck.service';
import { Team } from '../models/team.model';
import { ReviewQuality } from '../models/review-state.model';
import { applySm2, today } from './sm2';
import { NEW_CARDS_PER_DAY } from './srs.constants';
import { shuffle } from '../util/random.util';

@Injectable({ providedIn: 'root' })
export class SrsService {
  private db = inject(DbService);
  private deckService = inject(DeckService);

  async buildDailyQueue(deckId: string): Promise<Team[]> {
    const deck = await this.deckService.getDeck(deckId);
    if (!deck) return [];

    const currentDate = today();
    const allStates = await this.db.reviewStates.where('deckId').equals(deckId).toArray();
    const statesByTeamId = new Map(allStates.map(state => [state.teamId, state]));

    const dueTeamIds = allStates
      .filter(state => !state.suspended && state.dueDate <= currentDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map(state => state.teamId);

    const newTeamIds = deck.teamIds
      .filter(teamId => !statesByTeamId.has(teamId))
      .slice(0, NEW_CARDS_PER_DAY);

    for (const teamId of newTeamIds) {
      const state: StoredReviewState = {
        id: `${deckId}:${teamId}`,
        teamId,
        deckId,
        repetitions: 0,
        easeFactor: 2.5,
        intervalDays: 0,
        dueDate: currentDate,
        lapses: 0,
        suspended: false,
      };
      await this.db.reviewStates.put(state);
    }

    const queueTeamIds = [...shuffle(dueTeamIds), ...shuffle(newTeamIds)];
    const teams = await this.db.teams.bulkGet(queueTeamIds);
    return teams.filter((team): team is Team => !!team);
  }

  async grade(deckId: string, teamId: string, quality: ReviewQuality): Promise<void> {
    const id = `${deckId}:${teamId}`;
    const state = await this.db.reviewStates.get(id);
    if (!state) throw new Error(`ReviewState not found for ${id}`);

    const { id: _stateId, ...reviewState } = state;
    const updated = applySm2(reviewState, quality);
    await this.db.reviewStates.put({ ...updated, id });
  }
}
