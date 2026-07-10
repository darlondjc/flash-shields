import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { Loading03Icon } from '@hugeicons/core-free-icons';
import { ThemeService } from './core/theme/theme.service';
import { AppInitService } from './core/data/app-init.service';
import { ImportService } from './core/data/import.service';
import { NotificationService } from './core/notifications/notification.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, HugeiconsIconComponent],
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

  constructor() {
    void this.appInit.run();
  }
}
