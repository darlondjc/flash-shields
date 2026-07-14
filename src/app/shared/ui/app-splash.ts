import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Boot splash following docs/splash-screen.png: the brand mark (the flat
// two-tone shield from docs/icon.png, same artwork as the favicon) over a
// faint field of watermarked club crests, with the app name, tagline and a
// loading pulse. Purely presentational — App owns the show/fade/remove
// timing via the `leaving` input.
@Component({
  selector: 'app-splash',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-testid': 'app-splash',
    '[class.splash--leaving]': 'leaving()',
  },
  template: `
    <div class="splash__watermarks" aria-hidden="true">
      <svg class="splash__crest splash__crest--1" viewBox="0 0 40 48">
        <use href="#splash-crest" />
      </svg>
      <svg class="splash__crest splash__crest--2" viewBox="0 0 40 48">
        <use href="#splash-crest" />
      </svg>
      <svg class="splash__crest splash__crest--3" viewBox="0 0 40 48">
        <use href="#splash-crest" />
      </svg>
      <svg class="splash__crest splash__crest--4" viewBox="0 0 40 48">
        <use href="#splash-crest" />
      </svg>
      <svg class="splash__crest splash__crest--5" viewBox="0 0 40 48">
        <use href="#splash-crest" />
      </svg>
      <svg class="splash__crest splash__crest--6" viewBox="0 0 40 48">
        <use href="#splash-crest" />
      </svg>
      <svg width="0" height="0" style="position:absolute">
        <defs>
          <g id="splash-crest">
            <path
              d="M20 2 L37 8 V22 C37 33 30 41 20 46 C10 41 3 33 3 22 V8 Z"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            />
            <path
              d="M20 15 L22.4 20.4 L28 20.9 L23.8 24.7 L25.1 30.2 L20 27.2 L14.9 30.2 L16.2 24.7 L12 20.9 L17.6 20.4 Z"
              fill="currentColor"
            />
          </g>
        </defs>
      </svg>
    </div>

    <div class="splash__ring" aria-hidden="true"></div>

    <div class="splash__brand">
      <svg class="splash__logo" viewBox="0 0 140 160" role="img" aria-label="Escudos Flashcards">
        <defs>
          <!-- Hard stop at the middle recreates the icon's vertical fold. -->
          <linearGradient id="splash-shield" x1="0" y1="0" x2="140" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0.5" stop-color="#2dae48" />
            <stop offset="0.5" stop-color="#128d3e" />
          </linearGradient>
          <clipPath id="splash-ball">
            <circle cx="70" cy="80" r="24.5" />
          </clipPath>
        </defs>
        <path
          d="M70 6 L130 25 V84 C130 121 105 146 70 156 C35 146 10 121 10 84 V25 Z"
          fill="url(#splash-shield)"
        />
        <g transform="translate(70 80) scale(1.28) translate(-70 -80)">
          <circle cx="70" cy="80" r="30" fill="#ffffff" />
          <!-- Clipping inside the white circle leaves the thick white ring. -->
          <g clip-path="url(#splash-ball)" fill="url(#splash-shield)">
            <polygon points="70,69 80.5,76.6 76.5,89 63.5,89 59.5,76.6" />
            <polygon points="86.5,49.3 96,55.3 93.5,65.8 83,67 78.5,57.5" />
            <polygon points="103,84.7 107,94.5 100,102.5 90.5,98.5 91.5,88" />
            <polygon points="70,113 79.5,108.5 79,98 70,104.5 61,98 60.5,108.5" />
            <polygon points="37,84.7 33,94.5 40,102.5 49.5,98.5 48.5,88" />
            <polygon points="53.5,49.3 44,55.3 46.5,65.8 57,67 61.5,57.5" />
          </g>
        </g>
      </svg>

      <h1 class="splash__title">Escudos</h1>
      <p class="splash__subtitle">Flashcards</p>

      <div class="splash__divider" aria-hidden="true">
        <span></span>
        <svg viewBox="0 0 20 20" class="splash__star">
          <path
            d="M10 1.5 L12.4 7 L18.5 7.6 L13.9 11.6 L15.3 17.5 L10 14.4 L4.7 17.5 L6.1 11.6 L1.5 7.6 L7.6 7 Z"
            fill="currentColor"
          />
        </svg>
        <span></span>
      </div>

      <p class="splash__tagline">Memorize escudos. Domine o futebol.</p>
    </div>

    <div class="splash__loading">
      <div class="splash__dots" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <p class="splash__loading-label">Carregando...</p>
    </div>

    <div class="splash__stripes splash__stripes--left" aria-hidden="true"></div>
    <div class="splash__stripes splash__stripes--right" aria-hidden="true"></div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: var(--bg);
      opacity: 1;
      transition: opacity 0.45s ease;
    }

    :host(.splash--leaving) {
      opacity: 0;
      pointer-events: none;
    }

    .splash__watermarks {
      position: absolute;
      inset: 0;
      color: var(--text);
      opacity: 0.05;
    }

    .splash__crest {
      position: absolute;
      width: 56px;
    }

    .splash__crest--1 {
      top: 8%;
      left: 20%;
      transform: rotate(-8deg);
    }
    .splash__crest--2 {
      top: 6%;
      right: 18%;
      width: 48px;
      transform: rotate(10deg);
    }
    .splash__crest--3 {
      top: 26%;
      left: 7%;
      width: 64px;
      transform: rotate(6deg);
    }
    .splash__crest--4 {
      top: 24%;
      right: 6%;
      width: 52px;
      transform: rotate(-12deg);
    }
    .splash__crest--5 {
      top: 44%;
      left: 14%;
      width: 44px;
      transform: rotate(-15deg);
    }
    .splash__crest--6 {
      top: 42%;
      right: 13%;
      width: 58px;
      transform: rotate(14deg);
    }

    .splash__ring {
      position: absolute;
      top: 50%;
      left: 50%;
      width: min(78vw, 340px);
      aspect-ratio: 1;
      transform: translate(-50%, -78%);
      border: 1px solid var(--border);
      border-radius: 50%;
      opacity: 0.7;
    }

    .splash__brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 0 2rem;
      animation: splash-rise 0.7s ease-out both;
    }

    .splash__logo {
      width: clamp(120px, 34vw, 160px);
      filter: drop-shadow(0 12px 28px rgba(30, 126, 52, 0.35));
      margin-bottom: 1.75rem;
    }

    .splash__title {
      margin: 0;
      font-size: clamp(2.5rem, 12vw, 3.25rem);
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text);
      line-height: 1.05;
    }

    .splash__subtitle {
      margin: 0.35rem 0 0;
      font-size: 1.15rem;
      font-weight: 600;
      letter-spacing: 0.34em;
      /* compensate the trailing letter-spacing so the word reads centered */
      margin-left: 0.34em;
      color: var(--green);
    }

    .splash__divider {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: min(60vw, 240px);
      margin: 1.4rem 0 1.1rem;
      color: var(--green);

      span {
        flex: 1;
        height: 1px;
        background: var(--border);
      }
    }

    .splash__star {
      width: 14px;
      height: 14px;
    }

    .splash__tagline {
      margin: 0;
      font-size: 0.95rem;
      color: var(--text-muted);
    }

    .splash__loading {
      position: absolute;
      bottom: 9%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.85rem;
    }

    .splash__dots {
      display: flex;
      gap: 0.65rem;

      span {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--text-muted);
        opacity: 0.35;
        animation: splash-pulse 1.2s ease-in-out infinite;
      }

      span:nth-child(2) {
        animation-delay: 0.2s;
      }

      span:nth-child(3) {
        animation-delay: 0.4s;
      }
    }

    .splash__loading-label {
      margin: 0;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .splash__stripes {
      position: absolute;
      bottom: -80px;
      width: 280px;
      height: 280px;
      opacity: 0.28;
      background: repeating-linear-gradient(45deg, var(--green-dim) 0 26px, transparent 26px 52px);
      /* fade the chevrons out before they reach the loading dots */
      mask-image: linear-gradient(to top, black 25%, transparent 85%);
      pointer-events: none;
    }

    .splash__stripes--left {
      left: -110px;
      transform: rotate(90deg);
    }

    .splash__stripes--right {
      right: -110px;
    }

    @keyframes splash-rise {
      from {
        opacity: 0;
        transform: translateY(14px) scale(0.96);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes splash-pulse {
      0%,
      100% {
        opacity: 0.35;
        background: var(--text-muted);
        transform: scale(1);
      }
      40% {
        opacity: 1;
        background: var(--green);
        transform: scale(1.25);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        transition: none;
      }

      .splash__brand,
      .splash__dots span {
        animation: none;
      }

      .splash__dots span:nth-child(2) {
        opacity: 1;
        background: var(--green);
      }
    }
  `,
})
export class AppSplash {
  readonly leaving = input(false);
}
