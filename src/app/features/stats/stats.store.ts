import { Injectable, inject, signal } from '@angular/core';
import { DbService } from '../../core/persistence/db.service';
import { GameMode, Session } from '../../core/models/session.model';
import { League } from '../../core/models/league.model';

export interface DeckAccuracy {
  deckId: string;
  deckName: string;
  sessionCount: number;
  accuracy: number;
  league?: League;
}

export interface ModeStreak {
  mode: GameMode;
  bestStreak: number;
}

@Injectable({ providedIn: 'root' })
export class StatsStore {
  private db = inject(DbService);

  readonly totalSessions = signal(0);
  readonly overallAccuracy = signal(0);
  readonly accuracyByDeck = signal<DeckAccuracy[]>([]);
  readonly bestStreakByMode = signal<ModeStreak[]>([]);

  async load() {
    const sessions = await this.db.sessions.toArray();

    this.totalSessions.set(sessions.length);
    this.overallAccuracy.set(computeAccuracy(sessions.flatMap(session => session.answers)));
    this.accuracyByDeck.set(await this.computeAccuracyByDeck(sessions));
    this.bestStreakByMode.set(computeBestStreakByMode(sessions));
  }

  private async computeAccuracyByDeck(sessions: Session[]): Promise<DeckAccuracy[]> {
    const sessionsByDeck = new Map<string, Session[]>();
    for (const session of sessions) {
      const list = sessionsByDeck.get(session.deckId) ?? [];
      list.push(session);
      sessionsByDeck.set(session.deckId, list);
    }

    const deckIds = [...sessionsByDeck.keys()];
    const decks = await this.db.decks.bulkGet(deckIds);
    const deckById = new Map(deckIds.map((deckId, i) => [deckId, decks[i]]));

    const leagueIds = decks
      .map(deck => (deck?.scope.kind === 'league' ? deck.scope.leagueId : null))
      .filter((id): id is string => !!id);
    const leagues = await this.db.leagues.bulkGet(leagueIds);
    const leagueById = new Map(leagues.filter((league): league is League => !!league).map(league => [league.id, league]));

    const results: DeckAccuracy[] = [];
    for (const [deckId, deckSessions] of sessionsByDeck) {
      const deck = deckById.get(deckId);
      const league = deck?.scope.kind === 'league' ? leagueById.get(deck.scope.leagueId) : undefined;
      results.push({
        deckId,
        deckName: deck?.name ?? deckId,
        sessionCount: deckSessions.length,
        accuracy: computeAccuracy(deckSessions.flatMap(session => session.answers)),
        league,
      });
    }
    return results;
  }
}

function computeAccuracy(answers: { correct: boolean }[]): number {
  if (answers.length === 0) return 0;
  return answers.filter(answer => answer.correct).length / answers.length;
}

function computeBestStreakByMode(sessions: Session[]): ModeStreak[] {
  const bestByMode = new Map<GameMode, number>();
  for (const session of sessions) {
    const streak = longestCorrectStreak(session.answers);
    bestByMode.set(session.mode, Math.max(bestByMode.get(session.mode) ?? 0, streak));
  }
  return Array.from(bestByMode, ([mode, bestStreak]) => ({ mode, bestStreak }));
}

function longestCorrectStreak(answers: { correct: boolean }[]): number {
  let longest = 0;
  let current = 0;
  for (const answer of answers) {
    current = answer.correct ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}
