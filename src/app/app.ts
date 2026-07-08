import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { Home01Icon, GridViewIcon, Book01Icon, PlayIcon, ChartColumnIncreasingIcon } from '@hugeicons/core-free-icons';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, HugeiconsIconComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // Instantiating ThemeService here (rather than only where Settings injects
  // it) is what makes the theme apply app-wide from first paint, not just
  // after visiting /settings.
  private readonly theme = inject(ThemeService);

  readonly Home01Icon = Home01Icon;
  readonly GridViewIcon = GridViewIcon;
  readonly Book01Icon = Book01Icon;
  readonly PlayIcon = PlayIcon;
  readonly ChartColumnIncreasingIcon = ChartColumnIncreasingIcon;
}
