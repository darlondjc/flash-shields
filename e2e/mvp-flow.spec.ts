import { test, expect, Page } from '@playwright/test';

async function selectFirstLeague(page: Page) {
  await page.getByTestId('select-country').first().click();
  await page.getByTestId('select-league').first().click();
}

test('import a league, study one card, and play one round', async ({ page }) => {
  await page.goto('/');

  await selectFirstLeague(page);
  await expect(page.getByTestId('study-link')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('study-link').click();
  // The team-badge placeholder has no intrinsic size until the real badge
  // image finishes fetching from the network, so give it room to load.
  await expect(page.locator('.team-badge')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('reveal').click();
  await page.getByRole('button', { name: 'Bom' }).click();

  await page.goto('/');
  await selectFirstLeague(page);
  await page.getByTestId('game-link').click();
  const firstOption = page.getByTestId('option').first();
  await expect(firstOption).toBeVisible();
  await expect(page.getByText('1 / 10')).toBeVisible();
  await firstOption.click();
  await expect(page.getByText('2 / 10')).toBeVisible({ timeout: 5_000 });

  await page.goto('/');
  await page.getByTestId('stats-link').click();
  await expect(page.getByText('Estatísticas')).toBeVisible();
});

test('play reverse mode', async ({ page }) => {
  await page.goto('/');

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
