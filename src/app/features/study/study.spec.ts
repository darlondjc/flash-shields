import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Study } from './study';
import { StudyStore } from './study.store';
import { signal } from '@angular/core';
import { Team } from '../../core/models/team.model';

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
    current: ReturnType<typeof signal<Team | null>>;
    remaining: ReturnType<typeof signal<number>>;
    revealed: ReturnType<typeof signal<boolean>>;
  };

  beforeEach(async () => {
    storeSpy = {
      load: vi.fn().mockResolvedValue(undefined),
      reveal: vi.fn(),
      grade: vi.fn(),
      current: signal(makeTeam('ts-1')),
      remaining: signal(1),
      revealed: signal(false),
    };

    await TestBed.configureTestingModule({
      imports: [Study],
      providers: [{ provide: StudyStore, useValue: storeSpy }],
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
});
