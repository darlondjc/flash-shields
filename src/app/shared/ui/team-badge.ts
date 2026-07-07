import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { BadgeCacheService } from '../../core/persistence/badge-cache.service';
import { Team } from '../../core/models/team.model';

@Component({
  selector: 'app-team-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (imageUrl(); as url) {
      <img [src]="url" [alt]="team().name" class="team-badge" />
    } @else {
      <div class="team-badge team-badge--loading" [attr.aria-label]="team().name"></div>
    }
  `,
})
export class TeamBadge {
  private badgeCache = inject(BadgeCacheService);
  readonly team = input.required<Team>();
  readonly imageUrl = signal<string | null>(null);

  constructor() {
    effect(onCleanup => {
      const currentTeam = this.team();
      this.imageUrl.set(null);
      let cancelled = false;
      let objectUrl: string | null = null;
      this.badgeCache.getObjectUrl(currentTeam).then(url => {
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
