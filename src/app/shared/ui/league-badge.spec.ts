import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LeagueBadge } from './league-badge';
import { BadgeCacheService } from '../../core/persistence/badge-cache.service';
import { League } from '../../core/models/league.model';

describe('LeagueBadge', () => {
  let fixture: ComponentFixture<LeagueBadge>;
  let badgeCacheSpy: { getObjectUrl: ReturnType<typeof vi.fn> };

  const league: League = {
    id: 'ts-9001',
    externalIds: { thesportsdb: '9001' },
    name: 'Fake League',
    country: 'Testland',
    regionId: 'europe',
    sport: 'soccer',
    badgeUrl: 'https://example.com/fake-league.png',
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

    expect(badgeCacheSpy.getObjectUrl).toHaveBeenCalledWith('league:ts-9001', 'https://example.com/fake-league.png');
    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.src).toContain('blob:fake-url');
    expect(img.alt).toBe('Fake League');
  });

  it.each([
    ['ts-4328', 'Premier League', '/leagues/premier-league.png'],
    ['ts-4335', 'La Liga', '/leagues/la-liga.png'],
    ['ts-4331', 'Bundesliga', '/leagues/bundesliga.png'],
    ['ts-4334', 'Ligue 1', '/leagues/ligue-1.png'],
    ['ts-4337', 'Eredivisie', '/leagues/eredivisie.png'],
    ['ts-4344', 'Primeira Liga', '/leagues/primeira-liga.png'],
  ])('renders the local override asset for %s without hitting the badge cache', async (id, name, assetPath) => {
    const overriddenLeague: League = { ...league, id, name };
    fixture.componentRef.setInput('league', overriddenLeague);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(badgeCacheSpy.getObjectUrl).not.toHaveBeenCalled();
    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.src).toContain(assetPath);
    expect(img.alt).toBe(name);
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
