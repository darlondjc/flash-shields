import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Study } from './study';
import { StudyStore } from './study.store';
import { signal } from '@angular/core';
import { Team } from '../../core/models/team.model';
import { DeckService } from '../../core/decks/deck.service';
import { Deck } from '../../core/models/deck.model';

function makeTeam(id: string): Team {
  return {
    id,
    externalIds: {},
    name: `Team ${id}`,
    alternateNames: [],
    country: 'England',
    leagueIds: [],
    badgeUrl: 'https://example.com/x.png',
  };
}

describe('Study', () => {
  let fixture: ComponentFixture<Study>;
  let storeSpy: {
    load: ReturnType<typeof vi.fn>;
    reveal: ReturnType<typeof vi.fn>;
    grade: ReturnType<typeof vi.fn>;
    startExtra: ReturnType<typeof vi.fn>;
    current: ReturnType<typeof signal<Team | null>>;
    remaining: ReturnType<typeof signal<number>>;
    total: ReturnType<typeof signal<number>>;
    revealed: ReturnType<typeof signal<boolean>>;
  };

  beforeEach(async () => {
    storeSpy = {
      load: vi.fn().mockResolvedValue(undefined),
      reveal: vi.fn(),
      grade: vi.fn(),
      startExtra: vi.fn(),
      current: signal(makeTeam('ts-1')),
      remaining: signal(1),
      total: signal(1),
      revealed: signal(false),
    };

    const deck: Deck = {
      id: 'deck-1',
      name: 'Premier League',
      scope: { kind: 'league', leagueId: 'ts-4328' },
      teamIds: ['ts-1'],
      createdAt: new Date().toISOString(),
    };
    const deckServiceSpy = { getDeck: vi.fn().mockResolvedValue(deck) };

    await TestBed.configureTestingModule({
      imports: [Study],
      providers: [
        provideRouter([]),
        { provide: StudyStore, useValue: storeSpy },
        { provide: DeckService, useValue: deckServiceSpy },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Study);
    fixture.componentRef.setInput('deckId', 'deck-1');
  });

  it('loads the deck on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(storeSpy.load).toHaveBeenCalledWith('deck-1');
  });

  it('shows a "Mostrar resposta" button before reveal, grading buttons after', () => {
    fixture.detectChanges();
    const revealButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="reveal"]');
    expect(revealButton).toBeTruthy();

    revealButton.click();
    expect(storeSpy.reveal).toHaveBeenCalled();
  });

  it('shows "Nova sessão extra" and "Voltar" when the queue is empty, and starts an extra session on click', () => {
    storeSpy.current.set(null);
    fixture.detectChanges();

    const startExtraButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="start-extra"]');
    expect(startExtraButton).toBeTruthy();

    startExtraButton.click();
    expect(storeSpy.startExtra).toHaveBeenCalled();
  });

  it('"Voltar" in the empty state navigates to /estudo with the league preselected', async () => {
    storeSpy.current.set(null);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const backButton: HTMLButtonElement = Array.from(
      fixture.nativeElement.querySelectorAll('.empty-state button') as NodeListOf<HTMLButtonElement>,
    ).find((btn: HTMLButtonElement) => btn.textContent?.trim() === 'Voltar') as HTMLButtonElement;
    expect(backButton).toBeTruthy();

    backButton.click();
    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith(['/estudo'], { queryParams: { league: '4328' } });
  });
});
