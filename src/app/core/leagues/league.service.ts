import { Injectable, inject } from '@angular/core';
import { DbService } from '../persistence/db.service';
import { League } from '../models/league.model';

@Injectable({ providedIn: 'root' })
export class LeagueService {
  private db = inject(DbService);

  getLeague(id: string): Promise<League | undefined> {
    return this.db.leagues.get(id);
  }
}
