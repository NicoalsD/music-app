import { expect, importTones, openPlaylistTab, songButton, songOrder, test } from './fixtures';
import type { Page } from '@playwright/test';

/** Tabs forward until the focused element matches, with a bounded number of presses. */
async function tabTo(page: Page, name: string | RegExp, max = 60): Promise<void> {
  const target = page.getByRole('button', { name }).first();
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el.matches(':focus'))) return;
  }
  throw new Error(`Could not reach ${String(name)} with Tab`);
}

test.describe('keyboard', () => {
  test('imports, plays, navigates and removes without the mouse', async ({ page }) => {
    await page.goto('./');
    await openPlaylistTab(page);
    await importTones(page, ['tone-a', 'tone-b', 'tone-c']);
    await expect.poll(() => songOrder(page)).toEqual(['tone-a', 'tone-b', 'tone-c']);

    // Play with Enter on the focused play button.
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await tabTo(page, 'Reproducir', 80);
    await page.keyboard.press('Enter');
    await expect(songButton(page, 'tone-a')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();

    // Global shortcuts: focus on the body so Space is not consumed by a control.
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Reproducir', exact: true })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();

    await page.keyboard.press('Shift+ArrowRight');
    await expect(songButton(page, 'tone-b')).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(songButton(page, 'tone-a')).toHaveAttribute('aria-current', 'true');

    await page.keyboard.press('m');
    await expect(page.getByRole('button', { name: 'Activar sonido' })).toBeVisible();
    await page.keyboard.press('m');
    await expect(page.getByRole('button', { name: 'Silenciar' })).toBeVisible();

    // Remove the current song with the keyboard (Enter on its trash button).
    const remove = page.getByRole('button', { name: 'Quitar tone-a de la lista' });
    await remove.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => songOrder(page)).toEqual(['tone-b', 'tone-c']);
    await expect(songButton(page, 'tone-b')).toHaveAttribute('aria-current', 'true');
  });

  test('typing a space in a text field does not toggle playback', async ({ page }) => {
    await page.goto('./');
    await openPlaylistTab(page);
    await importTones(page, ['tone-a', 'tone-b', 'tone-c']);
    await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();

    // The search box needs a Spotify session, so the text field used here is the playlist name.
    await page.getByRole('button', { name: /^Cambiar de playlist/ }).click();
    await page.getByRole('menuitem', { name: 'Nueva playlist' }).click();
    const field = page.getByRole('textbox', { name: 'Nombre de la nueva playlist' });
    await expect(field).toBeFocused();
    // The dialog is still settling (focus trap), so retry the whole typing until it sticks.
    await expect(async () => {
      await field.fill('');
      await field.focus();
      await page.keyboard.type('Mi estudio');
      await expect(field).toHaveValue('Mi estudio', { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    // The modal hides the player from the accessibility tree, so check the tab title instead.
    await expect.poll(() => page.title()).toMatch(/^▶/);
  });
});
