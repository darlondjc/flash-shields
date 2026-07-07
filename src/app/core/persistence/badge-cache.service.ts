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
    } catch {
      // Some third-party badge CDNs (e.g. TheSportsDB's) don't send CORS headers, so a
      // browser-side XHR/fetch blob download is blocked and can never be cached locally.
      // Fall back to the remote URL directly so the badge still renders; it just won't be
      // available for offline reuse.
      return team.badgeUrl;
    }
  }
}
