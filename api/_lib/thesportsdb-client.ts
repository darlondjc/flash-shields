import { THESPORTSDB_BASE_URL, ThesportsdbGet } from '../../src/app/core/data/thesportsdb-scraper';

// Mesmo limite de 30 req/min do plano gratuito que o client Angular respeita
// (ver thesportsdb-scraper.ts) — a function de sync é agora quem bate direto
// na TheSportsDB, então o throttle precisa viver aqui.
const MIN_REQUEST_INTERVAL_MS = 2100;

export function createThesportsdbGet(): ThesportsdbGet {
  const apiKey = process.env['THESPORTSDB_API_KEY'] ?? '3';
  let lastRequestAt = 0;

  return async function get<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) {
      await new Promise(resolve => setTimeout(resolve, wait));
    }
    lastRequestAt = Date.now();

    const url = new URL(`${THESPORTSDB_BASE_URL}/${apiKey}/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TheSportsDB request failed: ${response.status} ${response.statusText} (${url})`);
    }
    return (await response.json()) as T;
  };
}
