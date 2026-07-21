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

export interface StudySessionSummary {
  id: string;
  startedAt: string;
  cardCount: number;
  accuracy: number;
}

export interface ReviewHeatmapDay {
  date: string;
  count: number;
}

@Injectable({ providedIn: 'root' })
export class StatsStore {
  private db = inject(DbService);

  readonly totalSessions = signal(0);
  readonly overallAccuracy = signal(0);
  readonly accuracyByDeck = signal<DeckAccuracy[]>([]);
  readonly bestStreakByMode = signal<ModeStreak[]>([]);
  readonly studySessions = signal<StudySessionSummary[]>([]);
  readonly reviewHeatmap = signal<ReviewHeatmapDay[]>([]);

  async load() {
    const sessions = await this.db.sessions.toArray();

    this.totalSessions.set(sessions.length);
    this.overallAccuracy.set(computeAccuracy(sessions.flatMap(session => session.answers)));
    this.accuracyByDeck.set(await this.computeAccuracyByDeck(sessions));
    this.bestStreakByMode.set(computeBestStreakByMode(sessions));

    const studySessions = sessions.filter(session => session.mode === 'study');
    this.studySessions.set(computeStudySessionSummaries(studySessions));
    this.reviewHeatmap.set(computeReviewHeatmap(studySessions));
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

const HEATMAP_DAYS = 90;

function computeStudySessionSummaries(sessions: Session[]): StudySessionSummary[] {
  return sessions
    .map(session => ({
      id: session.id,
      startedAt: session.startedAt,
      cardCount: session.answers.length,
      accuracy: computeAccuracy(session.answers),
    }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function computeReviewHeatmap(sessions: Session[]): ReviewHeatmapDay[] {
  const countsByDate = new Map<string, number>();
  for (const session of sessions) {
    for (const answer of session.answers) {
      const date = answer.answeredAt.slice(0, 10);
      countsByDate.set(date, (countsByDate.get(date) ?? 0) + 1);
    }
  }

  // Anchored on the same UTC-midnight representation `answeredAt.slice(0, 10)`
  // implies, so the "today" bucket lines up with real answers instead of
  // drifting by a day near local-timezone midnight.
  const todayUtc = new Date(new Date().toISOString().slice(0, 10));
  const days: ReviewHeatmapDay[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const date = new Date(todayUtc);
    date.setUTCDate(date.getUTCDate() - i);
    const key = date.toISOString().slice(0, 10);
    days.push({ date: key, count: countsByDate.get(key) ?? 0 });
  }
  return days;
}
