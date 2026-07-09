import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { BadgeCacheService } from '../../core/persistence/badge-cache.service';
import { League } from '../../core/models/league.model';

// TheSportsDB serves a badge we can't use well for some leagues: outdated (the
// Premier League's pre-2016 crest), white-on-transparent and invisible against
// this app's light theme (Eredivisie, Primeira Liga), or a full icon+wordmark
// lockup that's illegible once scaled down to this app's small badge chips
// (La Liga, Bundesliga, Ligue 1 all bake "LALIGA"/"BUNDESLIGA"/"LIGUE 1" text
// into the same square as the mark, so shrinking the whole image to ~40px also
// shrinks the text to a couple of pixels tall). Where that's noticeably wrong,
// serve our own — for the wordmark cases, an icon-only crop of the same mark —
// asset instead of their `strBadge` URL. This also sidesteps their CDN's
// CORS/reliability issues for these leagues, since the asset is same-origin.
const LOCAL_BADGE_OVERRIDES: Record<string, string> = {
  'ts-4328': '/leagues/premier-league.png',
  'ts-4335': '/leagues/la-liga.png',
  'ts-4331': '/leagues/bundesliga.png',
  'ts-4334': '/leagues/ligue-1.png',
  'ts-4337': '/leagues/eredivisie.png',
  'ts-4344': '/leagues/primeira-liga.png',
};

@Component({
  selector: 'app-league-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (imageUrl(); as url) {
      <img [src]="url" [alt]="league().name" class="league-badge" />
    }
  `,
  styles: [
    `
      .league-badge {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
    `,
  ],
})
export class LeagueBadge {
  private badgeCache = inject(BadgeCacheService);
  readonly league = input.required<League>();
  readonly imageUrl = signal<string | null>(null);

  constructor() {
    effect(onCleanup => {
      const currentLeague = this.league();
      this.imageUrl.set(null);

      const localOverride = LOCAL_BADGE_OVERRIDES[currentLeague.id];
      if (localOverride) {
        this.imageUrl.set(localOverride);
        return;
      }

      const badgeUrl = currentLeague.badgeUrl;
      // No badge fetched for this league yet (e.g. import predates badge fetching, or the
      // lookup returned none) — absence is a valid steady state here, unlike TeamBadge, so
      // there's nothing to load and no shimmer to show.
      if (!badgeUrl) return;

      let cancelled = false;
      let objectUrl: string | null = null;
      this.badgeCache.getObjectUrl(`league:${currentLeague.id}`, badgeUrl).then(url => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        this.imageUrl.set(url);
      });
      onCleanup(() => {
        cancelled = true;
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      });
    });
  }
}
