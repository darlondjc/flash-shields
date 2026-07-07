import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DbService } from './db.service';
import { Team } from '../models/team.model';

@Injectable({ providedIn: 'root' })
export class BadgeCacheService {
  private http = inject(HttpClient);
  private db = inject(DbService);

  async getObjectUrl(team: Team): Promise<string> {
    const cached = await this.db.badgeBlobs.get(team.id);
    if (cached) {
      return URL.createObjectURL(cached.blob);
    }

    try {
      const blob = await firstValueFrom(
        this.http.get(team.badgeUrl, { responseType: 'blob' }),
      );
      await this.db.badgeBlobs.put({ key: team.id, blob });
      return URL.createObjectURL(blob);
    } catch (err) {
      // Some third-party badge CDNs (e.g. TheSportsDB's) don't send CORS headers, so a
      // browser-side XHR/fetch blob download is blocked and can never be cached locally.
      // Fall back to the remote URL directly so the badge still renders; it just won't be
      // available for offline reuse. Log with enough context (team id, underlying error) so
      // this is distinguishable from other failures in this block, e.g. a `db.badgeBlobs.put`
      // write failure (IndexedDB quota, private browsing) — both used to fail silently the
      // same way, which is how the CORS issue went unnoticed for three prior tasks.
      console.warn(
        `BadgeCacheService: falling back to remote URL for team ${team.id} (fetch/cache failed)`,
        err,
      );
      return team.badgeUrl;
    }
  }
}
