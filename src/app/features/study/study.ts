import { ChangeDetectionStrategy, Component, computed, inject, input, effect } from '@angular/core';
import { Router } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import { StudyStore } from './study.store';
import { TeamBadge } from '../../shared/ui/team-badge';

@Component({
  selector: 'app-study',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TeamBadge, HugeiconsIconComponent],
  templateUrl: './study.html',
  styleUrl: './study.scss',
})
export class Study {
  readonly store = inject(StudyStore);
  private router = inject(Router);
  readonly deckId = input.required<string>();

  readonly Home01Icon = Home01Icon;

  readonly progressPercent = computed(() => {
    const total = this.store.total();
    if (total === 0) return 0;
    return ((total - this.store.remaining()) / total) * 100;
  });

  constructor() {
    effect(() => {
      this.store.load(this.deckId());
    });
  }

  back() {
    const sessionInProgress = !!this.store.current();
    if (sessionInProgress && !confirm('Sair do estudo? Sua sessão será interrompida.')) {
      return;
    }
    this.router.navigate(['/']);
  }
}
