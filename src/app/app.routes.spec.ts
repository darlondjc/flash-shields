import { routes } from './app.routes';

describe('routes', () => {
  it('defines the home, estudo, jogos, pesquisa, study, game, stats, and settings routes', () => {
    const paths = routes.map(route => route.path);
    expect(paths).toEqual(['', 'estudo', 'jogos', 'pesquisa', 'study/:deckId', 'game/:deckId', 'stats', 'settings']);
  });
});
