import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Every fresh browser context re-runs AppInitService's boot import of all
  // 12 leagues against the real TheSportsDB API before the app becomes
  // usable. Getting the full roster per league (not just the free tier's
  // capped 10) now costs ~10 round-scan requests + 1 per discovered team,
  // instead of a single bulk call — so cold import is meaningfully slower
  // than before. These timeouts have not been re-validated against that; if
  // e2e runs start timing out during import, that's expected, not a bug.
  timeout: 300_000,
  // Parallel contexts would each run that import at the same time and trip
  // the free tier's rate limit.
  workers: 1,
  webServer: {
    command: 'npx ng serve --port 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://localhost:4300',
  },
});
