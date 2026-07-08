import { routes } from './app.routes';

describe('routes', () => {
  it('defines the home, study, game, and stats routes', () => {
    const paths = routes.map(route => route.path);
    expect(paths).toEqual(['', 'study/:deckId', 'game/:deckId', 'stats']);
  });
});
