import { test, expect, Page } from '@playwright/test';

async function selectFirstLeague(page: Page) {
  await page.getByTestId('select-country').first().click();
  await page.getByTestId('select-league').first().click();
}

// The boot splash is a fixed-length brand intro (~2.2s) — imports run in the
// background behind it (see App). Waiting for it to unmount just guarantees
// the shell is interactive before the test starts clicking.
async function gotoHomeReady(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('app-splash')).toBeHidden({ timeout: 240_000 });
}

test('import a league, study one card, and play one round', async ({ page }) => {
  await gotoHomeReady(page);
  await page.getByTestId('home-estudo').click();

  await selectFirstLeague(page);
  await expect(page.getByTestId('study-link')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('study-link').click();
  // The team-badge placeholder has no intrinsic size until the real badge
  // image finishes fetching from the network, so give it room to load.
  // The flip card renders one badge per face, hence .first().
  await expect(page.locator('.team-badge').first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('reveal').click();
  await page.getByRole('button', { name: 'Bom' }).click();

  await page.goto('/');
  await page.getByTestId('home-jogos').click();
  await selectFirstLeague(page);
  await page.getByTestId('game-link').click();
  const firstOption = page.getByTestId('option').first();
  await expect(firstOption).toBeVisible();
  await expect(page.getByText('1 / 10')).toBeVisible();
  await firstOption.click();
  await expect(page.getByText('2 / 10')).toBeVisible({ timeout: 5_000 });

  await page.goto('/');
  await page.getByTestId('home-stats').click();
  await expect(page.getByText('Estatísticas')).toBeVisible();
});

test('play reverse mode', async ({ page }) => {
  await gotoHomeReady(page);
  await page.getByTestId('home-jogos').click();

  await selectFirstLeague(page);
  await expect(page.getByTestId('reverse-link')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('reverse-link').click();
  await expect(page.getByText('Reverso')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Qual é o escudo deste time?')).toBeVisible({ timeout: 10_000 });

  const firstOption = page.getByTestId('option').first();
  await expect(firstOption).toBeVisible();
  await expect(page.getByText('1 / 10')).toBeVisible();
  await firstOption.click();
  await expect(page.getByText('2 / 10')).toBeVisible({ timeout: 5_000 });
});

test('browse Pesquisa down to a team detail screen', async ({ page }) => {
  await gotoHomeReady(page);
  await page.getByTestId('home-pesquisa').click();

  await page.getByTestId('select-country').first().click();
  await page.getByTestId('select-league').first().click();
  // Team badges only appear once the boot-time import has produced a deck
  // for the league (see AppInitService), so give the grid room to populate.
  await expect(page.getByTestId('select-team').first()).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('select-team').first().click();
  await expect(page.getByTestId('team-detail')).toBeVisible();
});
