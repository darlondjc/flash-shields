import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then(m => m.Home),
  },
  {
    path: 'estudo',
    loadComponent: () => import('./features/league-picker/league-picker').then(m => m.LeaguePicker),
    data: { actions: ['study'], title: 'Estudo' },
  },
  {
    path: 'jogos',
    loadComponent: () => import('./features/league-picker/league-picker').then(m => m.LeaguePicker),
    data: { actions: ['play', 'reverse'], title: 'Jogos' },
  },
  {
    path: 'pesquisa',
    loadComponent: () => import('./features/search/search').then(m => m.Search),
  },
  {
    path: 'study/:deckId',
    loadComponent: () => import('./features/study/study').then(m => m.Study),
  },
  {
    path: 'game/:deckId',
    loadComponent: () => import('./features/game/game').then(m => m.Game),
  },
  {
    path: 'stats',
    loadComponent: () => import('./features/stats/stats').then(m => m.Stats),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then(m => m.Settings),
  },
];
