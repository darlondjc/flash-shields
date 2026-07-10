import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Home } from './home';

describe('Home', () => {
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
  });

  it('shows a card linking to each main section', () => {
    for (const testId of ['home-estudo', 'home-jogos', 'home-stats', 'home-pesquisa']) {
      expect(fixture.nativeElement.querySelector(`[data-testid="${testId}"]`)).toBeTruthy();
    }
  });

  it('always shows an enabled link to settings', () => {
    const settingsLink: HTMLAnchorElement = fixture.nativeElement.querySelector('[data-testid="settings-link"]');
    expect(settingsLink).toBeTruthy();
    expect(settingsLink.hasAttribute('disabled')).toBe(false);
  });
});
