import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import Loading03Icon from '@hugeicons/core-free-icons/Loading03Icon';
import { ThemeService } from './core/theme/theme.service';
import { AppInitService } from './core/data/app-init.service';
import { ImportService } from './core/data/import.service';
import { NotificationService } from './core/notifications/notification.service';
import { AppSplash } from './shared/ui/app-splash';

// The splash is a fixed-length brand moment, not a gate: imports keep running
// in the background (the import banner reports their progress), so it never
// waits on them — it fades after the minimum display and unmounts.
const SPLASH_MIN_DISPLAY_MS = 3000;
const SPLASH_FADE_MS = 450;

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, HugeiconsIconComponent, AppSplash],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // Instantiating ThemeService here (rather than only where Settings injects
  // it) is what makes the theme apply app-wide from first paint, not just
  // after visiting /settings.
  private readonly theme = inject(ThemeService);
  private readonly appInit = inject(AppInitService);
  readonly importService = inject(ImportService);
  readonly notifications = inject(NotificationService);

  readonly Loading03Icon = Loading03Icon;

  readonly splashState = signal<'visible' | 'leaving' | 'gone'>('visible');

  constructor() {
    void this.appInit.run();

    setTimeout(() => this.splashState.set('leaving'), SPLASH_MIN_DISPLAY_MS);
    setTimeout(() => this.splashState.set('gone'), SPLASH_MIN_DISPLAY_MS + SPLASH_FADE_MS);
  }
}
