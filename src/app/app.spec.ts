import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { App } from './app';
import { AppInitService, AppInitStage } from './core/data/app-init.service';

describe('App', () => {
  let appInitSpy: { stage: ReturnType<typeof signal<AppInitStage>>; run: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    appInitSpy = {
      stage: signal<AppInitStage>({ kind: 'importing', done: 0, total: 5 }),
      run: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AppInitService, useValue: appInitSpy }],
    }).compileComponents();
  });

  it('creates the app shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows a blocking splash with import progress while not ready', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const splash: HTMLElement = fixture.nativeElement.querySelector('[data-testid="app-splash"]');
    expect(splash?.textContent).toContain('Importando ligas... 0/5');
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeFalsy();
  });

  it('shows badge-warming progress once import finishes', () => {
    appInitSpy.stage.set({ kind: 'warming-badges', done: 3, total: 10 });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const splash: HTMLElement = fixture.nativeElement.querySelector('[data-testid="app-splash"]');
    expect(splash?.textContent).toContain('Carregando escudos... 3/10');
  });

  it('renders the app once initialization is ready', () => {
    appInitSpy.stage.set({ kind: 'ready' });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="app-splash"]')).toBeFalsy();
  });
});
