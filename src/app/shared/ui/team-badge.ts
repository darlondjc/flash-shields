import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { BadgeCacheService } from '../../core/persistence/badge-cache.service';
import { Team } from '../../core/models/team.model';

const MAX_LOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 600;

type BadgeVariant = 'answer' | 'question' | 'game';

@Component({
  selector: 'app-team-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="team-badge-wrap">
      @if (failed()) {
        <div class="team-badge team-badge--failed" [attr.aria-label]="team().name" role="img"></div>
      } @else if (imageUrl(); as url) {
        <img [src]="url" [alt]="team().name" class="team-badge" (error)="handleError()" />
      } @else {
        <div class="team-badge team-badge--loading" [attr.aria-label]="team().name"></div>
      }
    </div>
  `,
  styles: [
    `
      /* No intrinsic max size here on purpose: how big a badge renders
         depends entirely on where it's placed (a single flashcard vs. a
         4-up grid need very different sizes), so each consumer caps
         app-team-badge's width via its own stylesheet. */
      .team-badge-wrap {
        position: relative;
      }

      .team-badge {
        display: block;
        width: 100%;
        aspect-ratio: 1 / 1;
        height: auto;
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

      .team-badge--failed {
        border-radius: var(--radius-md);
        background: var(--surface-raised);
        border: 1px dashed var(--border);
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
  // 'question' usa badgeQuestionUrl, 'game' usa badgeGameUrl (variantes do
  // escudo sem o nome do time, geradas offline) quando o time tem uma;
  // caso contrário cai no escudo normal. Cada variante tem sua própria
  // entrada no cache de blobs.
  readonly variant = input<BadgeVariant>('answer');
  // Emitted once loading has failed MAX_LOAD_ATTEMPTS times in a row — lets a
  // consumer (e.g. the game grid) swap in a different team rather than leave
  // a permanently broken badge on screen.
  readonly loadFailed = output<void>();

  readonly imageUrl = signal<string | null>(null);
  readonly failed = signal(false);

  // Plain fields, not signals: reading them from inside the effect below
  // would make the effect depend on its own output and re-trigger itself.
  private currentUrl: string | null = null;
  private attempts = 0;
  private requestId = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  // URL/chave resolvidos pela variante ativa; usados também pelos retries de
  // handleError, que precisam recarregar exatamente o que o effect escolheu.
  private sourceUrl = '';
  private cacheKey = '';

  constructor() {
    effect(onCleanup => {
      const currentTeam = this.team();
      const variant = this.variant();
      const variantUrl = variant === 'question' ? currentTeam.badgeQuestionUrl
        : variant === 'game' ? currentTeam.badgeGameUrl
        : undefined;
      this.sourceUrl = variantUrl ?? currentTeam.badgeUrl;
      this.cacheKey = variantUrl ? `${currentTeam.id}:${variant}` : currentTeam.id;
      this.revokeCurrentUrl();
      this.imageUrl.set(null);
      this.failed.set(false);
      this.attempts = 0;
      const requestId = ++this.requestId;
      this.load(requestId);

      onCleanup(() => {
        // Bump requestId so any in-flight fetch or pending retry for the
        // previous team is a no-op once it resolves/fires.
        this.requestId++;
        if (this.retryTimer) {
          clearTimeout(this.retryTimer);
          this.retryTimer = null;
        }
        this.revokeCurrentUrl();
      });
    });
  }

  handleError() {
    this.revokeCurrentUrl();
    this.imageUrl.set(null);

    if (this.attempts >= MAX_LOAD_ATTEMPTS) {
      this.failed.set(true);
      this.loadFailed.emit();
      return;
    }

    const requestId = this.requestId;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.load(requestId, true);
    }, RETRY_DELAY_MS);
  }

  private load(requestId: number, forceRefresh = false) {
    this.attempts++;
    this.badgeCache.getObjectUrl(this.cacheKey, this.sourceUrl, forceRefresh).then(url => {
      if (requestId !== this.requestId) {
        URL.revokeObjectURL(url);
        return;
      }
      this.currentUrl = url;
      this.imageUrl.set(url);
    });
  }

  private revokeCurrentUrl() {
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  }
}
