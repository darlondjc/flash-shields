import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemePreference = 'dark' | 'light' | 'auto';

const STORAGE_KEY = 'flash-shields:theme';

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' || stored === 'light' || stored === 'auto' ? stored : 'auto';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(readStoredPreference());
  private readonly systemPrefersDark = signal(window.matchMedia('(prefers-color-scheme: dark)').matches);

  readonly resolvedTheme = computed<'dark' | 'light'>(() => {
    const preference = this.preference();
    return preference === 'auto' ? (this.systemPrefersDark() ? 'dark' : 'light') : preference;
  });

  constructor() {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', event => this.systemPrefersDark.set(event.matches));

    effect(() => {
      document.documentElement.setAttribute('data-theme', this.resolvedTheme());
    });
  }

  setPreference(preference: ThemePreference) {
    this.preference.set(preference);
    localStorage.setItem(STORAGE_KEY, preference);
  }
}
