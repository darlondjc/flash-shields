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
  styles: [
    `
      .team-badge {
        display: block;
        width: 168px;
        height: 168px;
        object-fit: contain;
        margin: 0 auto;
      }

      .team-badge--loading {
        border-radius: var(--radius-md);
        background: linear-gradient(
          100deg,
          var(--surface-raised) 30%,
          var(--surface-header) 45%,
          var(--surface-raised) 60%
        );
        background-size: 200% 100%;
        animation: badge-shimmer 1.3s ease-in-out infinite;
      }

      @keyframes badge-shimmer {
        from {
          background-position: 150% 0;
        }
        to {
          background-position: -50% 0;
        }
      }
    `,
  ],
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
