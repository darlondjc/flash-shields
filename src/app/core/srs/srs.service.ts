import { Injectable, inject } from '@angular/core';
import { DbService, StoredReviewState } from '../persistence/db.service';
import { DeckService } from '../decks/deck.service';
import { Team } from '../models/team.model';
import { ReviewGrade } from '../models/review-state.model';
import { applyLevelGrade, today } from './level';
import { NEW_CARDS_PER_DAY } from './srs.constants';
import { shuffle } from '../util/random.util';

export interface DeckStudySummary {
  memorizedCount: number;
  toRevisitCount: number;
  lastStudiedAt: string | null;
  nextStudyAvailable: boolean;
  nextStudyDueDate: string | null;
}

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
        level: 0,
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

  async buildExtraQueue(deckId: string): Promise<Team[]> {
    const deck = await this.deckService.getDeck(deckId);
    if (!deck) return [];

    const currentDate = today();
    const allStates = await this.db.reviewStates.where('deckId').equals(deckId).toArray();
    const existingTeamIds = new Set(allStates.map(state => state.teamId));

    const newTeamIds = deck.teamIds.filter(teamId => !existingTeamIds.has(teamId));
    for (const teamId of newTeamIds) {
      const state: StoredReviewState = {
        id: `${deckId}:${teamId}`,
        teamId,
        deckId,
        level: 0,
        dueDate: currentDate,
        lapses: 0,
        suspended: false,
      };
      await this.db.reviewStates.put(state);
    }

    const teams = await this.db.teams.bulkGet(shuffle(deck.teamIds));
    return teams.filter((team): team is Team => !!team);
  }

  async grade(deckId: string, teamId: string, grade: ReviewGrade): Promise<number> {
    const id = `${deckId}:${teamId}`;
    const state = await this.db.reviewStates.get(id);
    if (!state) throw new Error(`ReviewState not found for ${id}`);

    const { id: _stateId, ...reviewState } = state;
    const updated = applyLevelGrade(reviewState, grade);
    await this.db.reviewStates.put({ ...updated, id });
    return updated.level;
  }

  async getDeckSummary(deckId: string): Promise<DeckStudySummary> {
    const deck = await this.deckService.getDeck(deckId);
    const states = await this.db.reviewStates.where('deckId').equals(deckId).toArray();
    const currentDate = today();

    const memorizedCount = states.filter(state => !state.suspended && state.lastGrade === 'facil').length;

    const dueCount = states.filter(state => !state.suspended && state.dueDate <= currentDate).length;
    const newCount = (deck?.teamIds.length ?? 0) - states.length;
    const toRevisitCount = dueCount + Math.max(0, newCount);

    const sessions = await this.db.sessions.where('deckId').equals(deckId).toArray();
    const studySessions = sessions.filter(session => session.mode === 'study');
    const lastStudiedAt = studySessions.length
      ? studySessions.reduce((latest, session) => (session.startedAt > latest ? session.startedAt : latest), studySessions[0].startedAt)
      : null;

    const futureDueDates = states
      .filter(state => !state.suspended && state.dueDate > currentDate)
      .map(state => state.dueDate);
    const nextStudyDueDate = toRevisitCount === 0 && futureDueDates.length
      ? futureDueDates.reduce((min, date) => (date < min ? date : min))
      : null;

    return {
      memorizedCount,
      toRevisitCount,
      lastStudiedAt,
      nextStudyAvailable: toRevisitCount > 0,
      nextStudyDueDate,
    };
  }
}
