import { buildMultipleChoiceQuestions } from './game.util';
import { Team } from '../../core/models/team.model';

function makeTeams(count: number): Team[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ts-${i}`,
    externalIds: {},
    name: `Team ${i}`,
    alternateNames: [],
    country: 'England',
    leagueIds: [],
    badgeUrl: 'https://example.com/x.png',
  }));
}

describe('buildMultipleChoiceQuestions', () => {
  it('builds one question per requested round size, capped at pool size', () => {
    const teams = makeTeams(6);
    const questions = buildMultipleChoiceQuestions(teams, 4);
    expect(questions.length).toBe(4);
  });

  it('caps at pool size when roundSize exceeds it', () => {
    const teams = makeTeams(3);
    const questions = buildMultipleChoiceQuestions(teams, 10);
    expect(questions.length).toBe(3);
  });

  it('always includes the correct team among its own options', () => {
    const teams = makeTeams(8);
    const questions = buildMultipleChoiceQuestions(teams, 5);
    for (const question of questions) {
      expect(question.options.map(t => t.id)).toContain(question.correctTeam.id);
    }
  });

  it('never repeats a team within a single question\'s options', () => {
    const teams = makeTeams(8);
    const questions = buildMultipleChoiceQuestions(teams, 5);
    for (const question of questions) {
      const ids = question.options.map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
