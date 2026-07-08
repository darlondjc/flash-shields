import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { BadgeCacheService } from '../../core/persistence/badge-cache.service';
import { League } from '../../core/models/league.model';

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
