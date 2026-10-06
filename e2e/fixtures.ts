import { expect, test as base } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export type ToneName = 'tone-a' | 'tone-b' | 'tone-c';

const BLOCKED_HOSTS = [
  'accounts.spotify.com',
  'api.spotify.com',
  'sdk.scdn.co',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

/** Hermetic page: external hosts are blocked and storage starts empty (only on the first load). */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.route(
      (url) => BLOCKED_HOSTS.includes(url.hostname),
      (route) => route.abort(),
    );
    await page.addInitScript(() => {
      if (sessionStorage.getItem('e2e-cleared') === null) {
        localStorage.clear();
        sessionStorage.setItem('e2e-cleared', '1');
      }
    });
    await provide(page);
  },
});

export { expect };

export function tonePath(name: ToneName): string {
  return path.join(here, 'fixtures', `${name}.wav`);
}

/** Imports the given fixture tones through the hidden file input of the header button. */
export async function importTones(page: Page, names: readonly ToneName[]): Promise<void> {
  await page.getByLabel('Seleccionar archivos de audio').first().setInputFiles(names.map(tonePath));
}

/** Opens the playlist tab (needed on narrow screens; harmless on wide ones). */
export async function openPlaylistTab(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: 'Mi lista' });
  if (await tab.isVisible()) await tab.click();
}

/** The play button of a row in the playlist. */
export function songButton(page: Page, name: ToneName): Locator {
  return page.getByRole('button', { name: `Reproducir ${name}`, exact: true });
}

/** Visible song order, read from the row buttons. */
export async function songOrder(page: Page): Promise<string[]> {
  const labels = await page
    .getByRole('button', { name: /^Reproducir tone-/ })
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  return labels.map((l) => l.replace('Reproducir ', ''));
}
