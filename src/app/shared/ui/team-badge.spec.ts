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

  const otherTeam: Team = {
    id: 'ts-2',
    externalIds: {},
    name: 'Chelsea',
    alternateNames: [],
    country: 'England',
    leagueIds: [],
    badgeUrl: 'https://example.com/chelsea.png',
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

  it('revokes the previous object URL when the team input changes', async () => {
    badgeCacheSpy.getObjectUrl
      .mockReset()
      .mockResolvedValueOnce('blob:team-1-url')
      .mockResolvedValueOnce('blob:team-2-url');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(revokeSpy).not.toHaveBeenCalled();

    fixture.componentRef.setInput('team', otherTeam);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(revokeSpy).toHaveBeenCalledWith('blob:team-1-url');

    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.src).toContain('blob:team-2-url');
  });

  it('retries with a forced cache refresh after an image load error, and shows the badge once the retry succeeds', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
      img.dispatchEvent(new Event('error'));
      fixture.detectChanges();

      // Shows the loading shimmer while the retry is pending, not the failed state.
      expect(fixture.nativeElement.querySelector('.team-badge--loading')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.team-badge--failed')).toBeNull();

      await vi.advanceTimersByTimeAsync(1000);
      fixture.detectChanges();

      expect(badgeCacheSpy.getObjectUrl).toHaveBeenLastCalledWith(
        'ts-1',
        'https://example.com/arsenal.png',
        true,
      );
      expect(fixture.nativeElement.querySelector('img')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.team-badge--failed')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up and emits loadFailed after repeated load errors for the same team', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const failedSpy = vi.fn();
    fixture.componentInstance.loadFailed.subscribe(failedSpy);

    vi.useFakeTimers();
    try {
      for (let i = 0; i < 3; i++) {
        const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
        img.dispatchEvent(new Event('error'));
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(1000);
        fixture.detectChanges();
      }

      expect(failedSpy).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('.team-badge--failed')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('img')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
