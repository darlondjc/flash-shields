import { Team } from '../../core/models/team.model';
import { pickRandom, shuffle } from '../../core/util/random.util';

export interface MultipleChoiceQuestion {
  correctTeam: Team;
  options: Team[];
}

export function buildMultipleChoiceQuestions(
  teams: readonly Team[],
  roundSize: number,
): MultipleChoiceQuestion[] {
  const rounds = pickRandom(teams, Math.min(roundSize, teams.length));
  return rounds.map(correctTeam => {
    const distractorPool = teams.filter(team => team.id !== correctTeam.id);
    const distractors = pickRandom(distractorPool, 3);
    return { correctTeam, options: shuffle([correctTeam, ...distractors]) };
  });
}
