import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { Game } from './game';
import { GameStore } from './game.store';
import { Team } from '../../core/models/team.model';
import { MultipleChoiceQuestion, ReverseQuestion } from './game.util';
import { CrestTextRegionService } from '../../core/persistence/crest-text-region.service';

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

describe('Game', () => {
  let fixture: ComponentFixture<Game>;
  let storeSpy: {
    load: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    next: ReturnType<typeof vi.fn>;
    mode: ReturnType<typeof signal<'multiple-choice' | 'reverse'>>;
    current: ReturnType<typeof signal<MultipleChoiceQuestion | ReverseQuestion | null>>;
    finished: ReturnType<typeof signal<boolean>>;
    score: ReturnType<typeof signal<number>>;
    streak: ReturnType<typeof signal<number>>;
    bestStreak: ReturnType<typeof signal<number>>;
    selectedTeamId: ReturnType<typeof signal<string | null>>;
    index: ReturnType<typeof signal<number>>;
    total: ReturnType<typeof signal<number>>;
  };
  const correctTeam = makeTeam('ts-1');
  const options = [correctTeam, makeTeam('ts-2'), makeTeam('ts-3'), makeTeam('ts-4')];

  beforeEach(async () => {
    storeSpy = {
      load: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(),
      next: vi.fn(),
      mode: signal('multiple-choice'),
      current: signal({ correctTeam, options }),
      finished: signal(false),
      score: signal(0),
      streak: signal(0),
      bestStreak: signal(0),
      selectedTeamId: signal<string | null>(null),
      index: signal(0),
      total: signal(10),
    };

    await TestBed.configureTestingModule({
      imports: [Game],
      providers: [
        provideRouter([]),
        { provide: GameStore, useValue: storeSpy },
        { provide: CrestTextRegionService, useValue: { getRegions: vi.fn().mockResolvedValue([]) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Game);
    fixture.componentRef.setInput('deckId', 'deck-1');
  });

  it('loads the deck in multiple-choice mode by default', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(storeSpy.load).toHaveBeenCalledWith('deck-1', 'multiple-choice');
  });

  it('renders one option button per option and calls select() on click', () => {
    fixture.detectChanges();
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="option"]'),
    );
    expect(buttons.length).toBe(4);

    buttons[0].click();
    expect(storeSpy.select).toHaveBeenCalled();
  });

  it('passes the mode parameter from query params to store.load()', async () => {
    const router = TestBed.inject(Router);
    await router.navigate([], { queryParams: { mode: 'reverse' } });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(storeSpy.load).toHaveBeenCalledWith('deck-1', 'reverse');
  });
});
