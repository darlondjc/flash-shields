import { Injectable, inject } from '@angular/core';
import { DbService } from '../persistence/db.service';
import { Team } from '../models/team.model';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private db = inject(DbService);

  getTeam(id: string): Promise<Team | undefined> {
    return this.db.teams.get(id);
  }

  async searchByName(query: string): Promise<Team[]> {
    const needle = query.toLowerCase();
    const allTeams = await this.db.teams.toArray();
    return allTeams.filter(team => this.matches(team, needle));
  }

  private matches(team: Team, needle: string): boolean {
    if (team.name.toLowerCase().includes(needle)) return true;
    if (team.shortName?.toLowerCase().includes(needle)) return true;
    return team.alternateNames.some(name => name.toLowerCase().includes(needle));
  }
}
