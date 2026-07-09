import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DbService } from './db.service';

@Injectable({ providedIn: 'root' })
export class BadgeCacheService {
  private http = inject(HttpClient);
  private db = inject(DbService);

  // Badge URLs we've already learned can't be XHR/fetch-ed into a Blob (typically a CORS-blocking
  // CDN — TheSportsDB's r2.thesportsdb.com sends no Access-Control-Allow-Origin header, so this is
  // every badge in practice). Session-scoped: once a URL fails here, retrying the exact same
  // request will fail again every time (it's not transient), so we stop attempting it and go
  // straight to the <img>-tag fallback, which loads the same cross-origin image fine — browsers
  // only block *reading* the bytes via script, not rendering them. Without this, every single
  // badge render re-attempts and re-fails the same doomed fetch.
  private uncacheableUrls = new Set<string>();

  // key must be unique across every caller (teams and leagues share this cache/table), so
  // callers namespace their own ids — e.g. a team passes its id as-is, a league prefixes with
  // `league:` — to avoid a numeric id collision between TheSportsDB's team and league id spaces.
  //
  // forceRefresh skips the IndexedDB cache and re-fetches from the network — used when a
  // consumer retries after a failed <img> load, since a bad/corrupt cached blob would otherwise
  // keep being served forever.
  async getObjectUrl(key: string, badgeUrl: string, forceRefresh = false): Promise<string> {
    if (this.uncacheableUrls.has(badgeUrl)) {
      return badgeUrl;
    }

    if (!forceRefresh) {
      const cached = await this.db.badgeBlobs.get(key);
      if (cached) {
        return URL.createObjectURL(cached.blob);
      }
    }

    try {
      const blob = await firstValueFrom(this.http.get(badgeUrl, { responseType: 'blob' }));
      await this.db.badgeBlobs.put({ key, blob });
      return URL.createObjectURL(blob);
    } catch (err) {
      // Some third-party badge CDNs (e.g. TheSportsDB's) don't send CORS headers, so a
      // browser-side XHR/fetch blob download is blocked and can never be cached locally.
      // Fall back to the remote URL directly so the badge still renders; it just won't be
      // available for offline reuse. Log with enough context (cache key, underlying error) so
      // this is distinguishable from other failures in this block, e.g. a `db.badgeBlobs.put`
      // write failure (IndexedDB quota, private browsing) — both used to fail silently the
      // same way, which is how the CORS issue went unnoticed for three prior tasks.
      this.uncacheableUrls.add(badgeUrl);
      console.warn(`BadgeCacheService: falling back to remote URL for ${key} (fetch/cache failed)`, err);
      return badgeUrl;
    }
  }
}
