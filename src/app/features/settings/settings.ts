import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';

interface ThemeOption {
  value: ThemePreference;
  label: string;
}

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HugeiconsIconComponent],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  readonly theme = inject(ThemeService);

  readonly ArrowLeft01Icon = ArrowLeft01Icon;

  readonly themeOptions: ThemeOption[] = [
    { value: 'dark', label: 'Escuro' },
    { value: 'light', label: 'Claro' },
    { value: 'auto', label: 'Automático' },
  ];

  selectTheme(preference: ThemePreference) {
    this.theme.setPreference(preference);
  }
}
