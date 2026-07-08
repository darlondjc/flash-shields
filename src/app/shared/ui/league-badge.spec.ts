import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LeagueBadge } from './league-badge';
import { BadgeCacheService } from '../../core/persistence/badge-cache.service';
import { League } from '../../core/models/league.model';

describe('LeagueBadge', () => {
  let fixture: ComponentFixture<LeagueBadge>;
  let badgeCacheSpy: { getObjectUrl: ReturnType<typeof vi.fn> };

  const league: League = {
    id: 'ts-4328',
    externalIds: { thesportsdb: '4328' },
    name: 'Premier League',
    country: 'England',
    regionId: 'europe',
    sport: 'soccer',
    badgeUrl: 'https://example.com/premier.png',
  };

  const leagueWithoutBadge: League = { ...league, id: 'ts-9999', name: 'No Badge League', badgeUrl: undefined };

  beforeEach(async () => {
    badgeCacheSpy = { getObjectUrl: vi.fn().mockResolvedValue('blob:fake-url') };

    await TestBed.configureTestingModule({
      imports: [LeagueBadge],
      providers: [{ provide: BadgeCacheService, useValue: badgeCacheSpy }],
    }).compileComponents();
    fixture = TestBed.createComponent(LeagueBadge);
  });

  it('renders an img with the resolved object URL, namespacing the cache key', async () => {
    fixture.componentRef.setInput('league', league);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(badgeCacheSpy.getObjectUrl).toHaveBeenCalledWith('league:ts-4328', 'https://example.com/premier.png');
    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.src).toContain('blob:fake-url');
    expect(img.alt).toBe('Premier League');
  });

  it('renders nothing when the league has no badge yet', async () => {
    fixture.componentRef.setInput('league', leagueWithoutBadge);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(badgeCacheSpy.getObjectUrl).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });

  it('revokes the previous object URL when the league input changes', async () => {
    badgeCacheSpy.getObjectUrl
      .mockReset()
      .mockResolvedValueOnce('blob:league-1-url')
      .mockResolvedValueOnce('blob:league-2-url');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const otherLeague: League = { ...league, id: 'ts-1', badgeUrl: 'https://example.com/other.png' };

    fixture.componentRef.setInput('league', league);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(revokeSpy).not.toHaveBeenCalled();

    fixture.componentRef.setInput('league', otherLeague);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(revokeSpy).toHaveBeenCalledWith('blob:league-1-url');
    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.src).toContain('blob:league-2-url');
  });
});
