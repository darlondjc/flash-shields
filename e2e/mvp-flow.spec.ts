import { test, expect } from '@playwright/test';

test('import a league, study one card, and play one round', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('import').click();
  await expect(page.getByTestId('study-link')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('study-link').click();
  // The team-badge placeholder has no intrinsic size until the real badge
  // image finishes fetching from the network, so give it room to load.
  await expect(page.locator('.team-badge')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('reveal').click();
  await page.getByRole('button', { name: 'Bom' }).click();

  await page.goto('/');
  await page.getByTestId('game-link').click();
  const firstOption = page.getByTestId('option').first();
  await expect(firstOption).toBeVisible();
  await firstOption.click();
  await expect(page.getByRole('button', { name: 'Próxima' })).toBeVisible();

  await page.goto('/');
  await page.getByTestId('stats-link').click();
  await expect(page.getByText('Estatísticas')).toBeVisible();
});

test('play reverse mode', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('import').click();
  await expect(page.getByTestId('reverse-link')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('reverse-link').click();
  await expect(page.getByText('Reverso')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Qual é o escudo deste time?')).toBeVisible({ timeout: 10_000 });

  const firstOption = page.getByTestId('option').first();
  await expect(firstOption).toBeVisible();
  await firstOption.click();
  await expect(page.getByRole('button', { name: 'Próxima' })).toBeVisible();
});
