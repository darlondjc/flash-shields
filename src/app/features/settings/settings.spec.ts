import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Settings } from './settings';

describe('Settings', () => {
  let fixture: ComponentFixture<Settings>;

  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');

    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Settings);
  });

  it('lists the three theme options', () => {
    fixture.detectChanges();

    const options: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll(
      '[data-testid="theme-option"]',
    );
    expect(options.length).toBe(3);
    expect(Array.from(options).map(option => option.textContent?.trim())).toEqual([
      'Claro',
      'Escuro',
      'Auto',
    ]);
  });

  it('marks the current preference as active and updates it on click', () => {
    fixture.detectChanges();

    const options: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll(
      '[data-testid="theme-option"]',
    );
    const lightOption = Array.from(options).find(option => option.textContent?.trim() === 'Claro')!;

    lightOption.click();
    fixture.detectChanges();

    expect(lightOption.getAttribute('aria-checked')).toBe('true');
    expect(lightOption.classList.contains('theme-option--active')).toBe(true);
    expect(localStorage.getItem('flash-shields:theme')).toBe('light');
  });

  it('clears local data when the reset action is clicked', async () => {
    localStorage.setItem('flash-shields:theme', 'dark');
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="clear-local-data"]');
    button.click();
    await fixture.whenStable();

    expect(localStorage.length).toBe(0);
  });
});
