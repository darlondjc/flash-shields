import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { Shield01Icon } from '@hugeicons/core-free-icons';
import { ThemeService } from './core/theme/theme.service';
import { AppInitService } from './core/data/app-init.service';

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
  readonly appInit = inject(AppInitService);

  readonly Shield01Icon = Shield01Icon;

  constructor() {
    void this.appInit.run();
  }
}
