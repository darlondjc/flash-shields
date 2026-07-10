import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { App } from './app';
import { AppInitService } from './core/data/app-init.service';
import { ImportService } from './core/data/import.service';
import { NotificationService } from './core/notifications/notification.service';

describe('App', () => {
  let importServiceSpy: {
    isImporting: ReturnType<typeof signal<boolean>>;
    progress: ReturnType<typeof signal<{ done: number; total: number } | null>>;
  };
  let notificationsSpy: { message: ReturnType<typeof signal<string | null>> };

  beforeEach(async () => {
    importServiceSpy = {
      isImporting: signal(false),
      progress: signal<{ done: number; total: number } | null>(null),
    };
    notificationsSpy = { message: signal<string | null>(null) };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AppInitService, useValue: { run: vi.fn().mockResolvedValue(undefined) } },
        { provide: ImportService, useValue: importServiceSpy },
        { provide: NotificationService, useValue: notificationsSpy },
      ],
    }).compileComponents();
  });

  it('creates the app shell and renders the router outlet immediately', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });

  it('shows a non-blocking import banner with progress while importing', () => {
    importServiceSpy.isImporting.set(true);
    importServiceSpy.progress.set({ done: 2, total: 5 });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const banner: HTMLElement = fixture.nativeElement.querySelector('[data-testid="import-banner"]');
    expect(banner?.textContent).toContain('2/5');
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });

  it('hides the import banner once importing finishes', () => {
    importServiceSpy.isImporting.set(false);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="import-banner"]')).toBeFalsy();
  });

  it('shows a toast with the latest notification message', () => {
    notificationsSpy.message.set('Importação concluída: 3 ligas atualizadas.');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const toast: HTMLElement = fixture.nativeElement.querySelector('[data-testid="app-toast"]');
    expect(toast?.textContent).toContain('Importação concluída');
  });
});
