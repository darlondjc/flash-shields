import { countryOptions, leaguesForCountry, countryFlag } from './league-catalog';
import { LeagueImportConfig } from '../data/league-import.config';

const configs: LeagueImportConfig[] = [
  { externalId: '4328', name: 'Premier League', country: 'Inglaterra', regionId: 'europe' },
  { externalId: '4329', name: 'Championship', country: 'Inglaterra', regionId: 'europe' },
  { externalId: '4335', name: 'La Liga', country: 'Espanha', regionId: 'europe' },
  { externalId: '4356', name: 'Copa do Mundo', country: 'Internacional', regionId: 'world', comingSoon: true },
];

describe('league-catalog', () => {
  it('groups leagues by country with a count', () => {
    const options = countryOptions(configs);
    expect(options.find(o => o.name === 'Inglaterra')?.count).toBe(2);
    expect(options.find(o => o.name === 'Espanha')?.count).toBe(1);
  });

  it('returns a flag for a known country and a fallback for an unknown one', () => {
    expect(countryFlag('Brasil')).toBe('🇧🇷');
    expect(countryFlag('Nárnia')).toBe('🏟️');
  });

  it('filters leagues by country, preserving config order', () => {
    const england = leaguesForCountry(configs, 'Inglaterra');
    expect(england.map(c => c.externalId)).toEqual(['4328', '4329']);
  });

  it('includes comingSoon leagues — callers decide whether to filter them out', () => {
    const world = leaguesForCountry(configs, 'Internacional');
    expect(world).toHaveLength(1);
    expect(world[0].comingSoon).toBe(true);
  });
});
