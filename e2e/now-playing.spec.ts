import { expect, importTones, openPlaylistTab, test } from './fixtures';

const LRC = '[00:00.00] Opening words\n[00:00.50] Second words\n[00:01.50] Closing words\n';

test.describe('now playing', () => {
  test('opens with synced lyrics, seeks from a line and closes with Escape', async ({ page }) => {
    await page.route('https://lrclib.net/**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          duration: 1,
          syncedLyrics: LRC,
          plainLyrics: 'Opening words\nSecond words\nClosing words',
          instrumental: false,
        }),
      }),
    );

    await page.goto('./');
    await openPlaylistTab(page);
    await importTones(page, ['tone-a']);
    const letra = page.getByRole('button', { name: 'Letra', exact: true });
    await expect(letra).toBeEnabled();

    await letra.click();
    const view = page.getByRole('dialog', { name: 'Reproduciendo ahora' });
    await expect(view).toBeVisible();
    await expect(view.getByRole('heading', { name: 'tone-a' })).toBeVisible();
    await expect(view.getByRole('button', { name: 'Opening words' })).toBeVisible();

    // Seeking needs a loaded song: start it and pause so the position stays put.
    await view.getByRole('button', { name: 'Reproducir', exact: true }).click();
    await view.getByRole('button', { name: 'Pausar', exact: true }).click();
    await view.getByRole('button', { name: 'Closing words' }).click();
    await expect(view.getByRole('button', { name: 'Closing words' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await page.keyboard.press('Escape');
    await expect(view).toBeHidden();
    await expect(letra).toBeFocused();
  });
});
