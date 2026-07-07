import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeamBadge } from './team-badge';
import { BadgeCacheService } from '../../core/persistence/badge-cache.service';
import { Team } from '../../core/models/team.model';

describe('TeamBadge', () => {
  let fixture: ComponentFixture<TeamBadge>;
  let badgeCacheSpy: { getObjectUrl: ReturnType<typeof vi.fn> };

  const team: Team = {
    id: 'ts-1',
    externalIds: {},
    name: 'Arsenal',
    alternateNames: [],
    country: 'England',
    leagueIds: [],
    badgeUrl: 'https://example.com/arsenal.png',
  };

  beforeEach(async () => {
    badgeCacheSpy = { getObjectUrl: vi.fn().mockResolvedValue('blob:fake-url') };

    await TestBed.configureTestingModule({
      imports: [TeamBadge],
      providers: [{ provide: BadgeCacheService, useValue: badgeCacheSpy }],
    }).compileComponents();
    fixture = TestBed.createComponent(TeamBadge);
    fixture.componentRef.setInput('team', team);
  });

  it('renders an img with the resolved object URL and the team name as alt text', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.src).toContain('blob:fake-url');
    expect(img.alt).toBe('Arsenal');
  });
});
