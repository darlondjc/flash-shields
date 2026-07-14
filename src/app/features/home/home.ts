import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon';
import Book01Icon from '@hugeicons/core-free-icons/Book01Icon';
import Quiz01Icon from '@hugeicons/core-free-icons/Quiz01Icon';
import ChartColumnIncreasingIcon from '@hugeicons/core-free-icons/ChartColumnIncreasingIcon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';

interface HomeCard {
  routerLink: string;
  icon: typeof Book01Icon;
  title: string;
  subtitle: string;
  testId: string;
  accent: 'green' | 'purple' | 'blue' | 'orange';
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
    { routerLink: '/estudo', icon: Book01Icon, title: 'Estudo', subtitle: 'Revisão espaçada', testId: 'home-estudo', accent: 'green' },
    { routerLink: '/jogos', icon: Quiz01Icon, title: 'Jogos', subtitle: 'Múltipla escolha e reverso', testId: 'home-jogos', accent: 'purple' },
    { routerLink: '/stats', icon: ChartColumnIncreasingIcon, title: 'Stats', subtitle: 'Seu progresso', testId: 'home-stats', accent: 'blue' },
    { routerLink: '/pesquisa', icon: Search01Icon, title: 'Pesquisa', subtitle: 'Times e ligas', testId: 'home-pesquisa', accent: 'orange' },
  ];
}
