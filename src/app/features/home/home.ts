import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  Home01Icon,
  Settings01Icon,
  Book01Icon,
  Quiz01Icon,
  ChartColumnIncreasingIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';

interface HomeCard {
  routerLink: string;
  icon: typeof Book01Icon;
  title: string;
  subtitle: string;
  testId: string;
}

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HugeiconsIconComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  readonly Home01Icon = Home01Icon;
  readonly Settings01Icon = Settings01Icon;

  readonly cards: HomeCard[] = [
    { routerLink: '/estudo', icon: Book01Icon, title: 'Estudo', subtitle: 'Revisão espaçada', testId: 'home-estudo' },
    { routerLink: '/jogos', icon: Quiz01Icon, title: 'Jogos', subtitle: 'Múltipla escolha e reverso', testId: 'home-jogos' },
    { routerLink: '/stats', icon: ChartColumnIncreasingIcon, title: 'Stats', subtitle: 'Seu progresso', testId: 'home-stats' },
    { routerLink: '/pesquisa', icon: Search01Icon, title: 'Pesquisa', subtitle: 'Times e ligas', testId: 'home-pesquisa' },
  ];
}
