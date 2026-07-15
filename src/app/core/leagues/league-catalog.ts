import { LeagueImportConfig } from '../data/league-import.config';

export interface CountryOption {
  name: string;
  flag: string;
  count: number;
}

const COUNTRY_FLAGS: Record<string, string> = {
  Alemanha: '🇩🇪',
  Brasil: '🇧🇷',
  Espanha: '🇪🇸',
  França: '🇫🇷',
  Inglaterra: '🇬🇧',
  Itália: '🇮🇹',
  'Países Baixos': '🇳🇱',
  Portugal: '🇵🇹',
  'Estados Unidos': '🇺🇸',
  Internacional: '🌍',
};

export function countryFlag(country: string): string {
  return COUNTRY_FLAGS[country] ?? '🏟️';
}

export function countryOptions(configs: LeagueImportConfig[]): CountryOption[] {
  const countries = new Map<string, CountryOption>();

  for (const config of configs) {
    const existing = countries.get(config.country);
    if (!existing) {
      countries.set(config.country, { name: config.country, flag: countryFlag(config.country), count: 1 });
      continue;
    }
    existing.count += 1;
  }

  return Array.from(countries.values());
}

export function leaguesForCountry(configs: LeagueImportConfig[], country: string): LeagueImportConfig[] {
  return configs.filter(config => config.country === country);
}
