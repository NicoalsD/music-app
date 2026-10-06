import AxeBuilder from '@axe-core/playwright';
import { expect, importTones, openPlaylistTab, songOrder, test } from './fixtures';
import type { Page } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) }));
}

for (const viewport of viewports) {
  test.describe(`a11y ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('empty playlist has no serious violations', async ({ page }) => {
      await page.goto('./');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      await openPlaylistTab(page);
      await expect(page.getByText('El cordón está vacío')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    test('playlist with songs has no serious violations', async ({ page }) => {
      await page.goto('./');
      await openPlaylistTab(page);
      await importTones(page, ['tone-a', 'tone-b', 'tone-c']);
      await expect.poll(() => songOrder(page)).toHaveLength(3);
      await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}
