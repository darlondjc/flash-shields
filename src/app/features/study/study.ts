import { ChangeDetectionStrategy, Component, computed, inject, input, effect } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
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
  private route = inject(ActivatedRoute);
  readonly deckId = input.required<string>();

  readonly ArrowLeft01Icon = ArrowLeft01Icon;

  readonly progressPercent = computed(() => {
    const total = this.store.total();
    if (total === 0) return 0;
    return ((total - this.store.remaining()) / total) * 100;
  });

  private readonly returnLeagueId = this.route.snapshot.queryParamMap.get('league');

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
    this.router.navigate(['/'], { queryParams: this.returnLeagueId ? { league: this.returnLeagueId } : {} });
  }
}
