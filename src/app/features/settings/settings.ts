import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { ArrowLeft01Icon, Delete01Icon } from '@hugeicons/core-free-icons';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';
import { DbService } from '../../core/persistence/db.service';

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
  private readonly db = inject(DbService);

  readonly ArrowLeft01Icon = ArrowLeft01Icon;
  readonly Delete01Icon = Delete01Icon;

  readonly themeOptions: ThemeOption[] = [
    { value: 'dark', label: 'Escuro' },
    { value: 'light', label: 'Claro' },
    { value: 'auto', label: 'Automático' },
  ];

  selectTheme(preference: ThemePreference) {
    this.theme.setPreference(preference);
  }

  async clearLocalData() {
    localStorage.clear();
    await this.db.delete();
    window.location.reload();
  }
}
