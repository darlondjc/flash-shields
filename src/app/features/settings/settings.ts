import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import Delete01Icon from '@hugeicons/core-free-icons/Delete01Icon';
import RefreshIcon from '@hugeicons/core-free-icons/RefreshIcon';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';
import { DbService } from '../../core/persistence/db.service';
import { ImportService } from '../../core/data/import.service';
import { LeagueService } from '../../core/leagues/league.service';
import { LEAGUES_TO_IMPORT } from '../../core/data/league-import.config';

interface ThemeOption {
  value: ThemePreference;
  label: string;
}

interface DataStats {
  countries: number;
  leagues: number;
  teams: number;
}

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HugeiconsIconComponent, DatePipe],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  readonly theme = inject(ThemeService);
  private readonly db = inject(DbService);
  readonly importService = inject(ImportService);
  private readonly leagueService = inject(LeagueService);

  readonly Home01Icon = Home01Icon;
  readonly Delete01Icon = Delete01Icon;
  readonly RefreshIcon = RefreshIcon;

  readonly themeOptions: ThemeOption[] = [
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Escuro' },
    { value: 'auto', label: 'Auto' },
  ];

  readonly hasImportedLeagues = signal(false);
  readonly dataStats = signal<DataStats | null>(null);

  constructor() {
    void this.checkImportedLeagues();
    // ImportService.progress changes on every league import tick (including
    // background boot-time imports), so this also catches the moment the
    // first league lands and the refresh button should appear — and keeps
    // the data summary card counting up while an import runs.
    effect(() => {
      this.importService.progress();
      void this.checkImportedLeagues();
    });
  }

  private async checkImportedLeagues() {
    const leagues = await this.leagueService.listLeagues();
    this.hasImportedLeagues.set(leagues.length > 0);

    const teams = await this.db.teams.count();
    this.dataStats.set({
      countries: new Set(leagues.map(league => league.country)).size,
      leagues: leagues.length,
      teams,
    });
  }

  selectTheme(preference: ThemePreference) {
    this.theme.setPreference(preference);
  }

  async refreshImportedData() {
    const leagues = await this.leagueService.listLeagues();
    const importedIds = new Set(leagues.map(league => league.externalIds['thesportsdb']));
    const configs = LEAGUES_TO_IMPORT.filter(config => importedIds.has(config.externalId));
    await this.importService.importLeagues(configs);
  }

  async clearLocalData() {
    localStorage.clear();
    await this.db.delete();
    window.location.reload();
  }
}
