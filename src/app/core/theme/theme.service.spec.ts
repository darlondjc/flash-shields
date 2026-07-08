import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

const STORAGE_KEY = 'flash-shields:theme';

function stubMatchMedia(matches: boolean) {
  const listeners: Array<(event: MediaQueryListEvent) => void> = [];
  const media = {
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.push(listener);
    },
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;

  window.matchMedia = () => media;

  return {
    fireChange(nextMatches: boolean) {
      listeners.forEach(listener => listener({ matches: nextMatches } as MediaQueryListEvent));
    },
  };
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to auto and resolves to dark when the system prefers dark', () => {
    stubMatchMedia(true);
    const service = TestBed.inject(ThemeService);
    TestBed.flushEffects();

    expect(service.preference()).toBe('auto');
    expect(service.resolvedTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves auto to light when the system prefers light', () => {
    stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    TestBed.flushEffects();

    expect(service.resolvedTheme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('reads a stored preference on startup', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    stubMatchMedia(true);
    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('light');
    expect(service.resolvedTheme()).toBe('light');
  });

  it('ignores an invalid stored value and falls back to auto', () => {
    localStorage.setItem(STORAGE_KEY, 'not-a-real-theme');
    stubMatchMedia(true);
    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('auto');
  });

  it('setPreference updates the signal, persists to localStorage, and applies the attribute', () => {
    stubMatchMedia(true);
    const service = TestBed.inject(ThemeService);

    service.setPreference('light');
    TestBed.flushEffects();

    expect(service.preference()).toBe('light');
    expect(service.resolvedTheme()).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('reacts to a system theme change while preference is auto', () => {
    const media = stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    expect(service.resolvedTheme()).toBe('light');

    media.fireChange(true);
    TestBed.flushEffects();

    expect(service.resolvedTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('ignores a system theme change while preference is an explicit choice', () => {
    const media = stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    service.setPreference('light');

    media.fireChange(true);

    expect(service.preference()).toBe('light');
    expect(service.resolvedTheme()).toBe('light');
  });
});
