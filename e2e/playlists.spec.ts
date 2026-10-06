import { expect, importTones, openPlaylistTab, songOrder, test } from './fixtures';
import type { Page } from '@playwright/test';

const switcher = (page: Page, name: string) =>
  page.getByRole('button', { name: `Cambiar de playlist: ${name}` });

test.describe('multiple playlists', () => {
  test('creates, switches, keeps contents separate, renames and deletes', async ({ page }) => {
    await page.goto('./');
    await openPlaylistTab(page);
    await importTones(page, ['tone-a']);
    await expect.poll(() => songOrder(page)).toEqual(['tone-a']);

    // Create "Estudio": it becomes active and is empty.
    await switcher(page, 'Mi lista').click();
    await page.getByRole('menuitem', { name: 'Nueva playlist' }).click();
    await page.getByRole('textbox', { name: 'Nombre de la nueva playlist' }).fill('Estudio');
    await page.getByRole('button', { name: 'Crear' }).click();
    await expect(switcher(page, 'Estudio')).toBeVisible();
    await expect(page.getByText('El cordón está vacío')).toBeVisible();

    await importTones(page, ['tone-b']);
    await expect.poll(() => songOrder(page)).toEqual(['tone-b']);

    // Back to "Mi lista": contents are separate.
    await switcher(page, 'Estudio').click();
    await page.getByRole('menuitemradio', { name: /^Mi lista/ }).click();
    await expect(switcher(page, 'Mi lista')).toBeVisible();
    await expect.poll(() => songOrder(page)).toEqual(['tone-a']);

    // Rename the active one.
    await switcher(page, 'Mi lista').click();
    await page.getByRole('menuitem', { name: 'Renombrar' }).click();
    const nameInput = page.getByRole('textbox', { name: 'Nuevo nombre' });
    await nameInput.fill('Favoritas');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(switcher(page, 'Favoritas')).toBeVisible();

    // Delete with confirmation.
    await switcher(page, 'Favoritas').click();
    await page.getByRole('menuitem', { name: 'Eliminar playlist' }).click();
    const dialog = page.getByRole('dialog', { name: '¿Eliminar la playlist?' });
    await expect(dialog).toContainText('"Favoritas"');
    await dialog.getByRole('button', { name: 'Eliminar' }).click();
    await expect(dialog).toBeHidden();
    await expect(switcher(page, 'Estudio')).toBeVisible();
    await expect.poll(() => songOrder(page)).toEqual(['tone-b']);
  });

  test('cancelling the delete confirmation keeps the playlist', async ({ page }) => {
    await page.goto('./');
    await openPlaylistTab(page);
    await switcher(page, 'Mi lista').click();
    await page.getByRole('menuitem', { name: 'Nueva playlist' }).click();
    await page.getByRole('textbox', { name: 'Nombre de la nueva playlist' }).fill('Estudio');
    await page.getByRole('button', { name: 'Crear' }).click();
    await expect(switcher(page, 'Estudio')).toBeVisible();

    await switcher(page, 'Estudio').click();
    await page.getByRole('menuitem', { name: 'Eliminar playlist' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(switcher(page, 'Estudio')).toBeVisible();
  });

  test('the last remaining playlist cannot be deleted', async ({ page }) => {
    await page.goto('./');
    await openPlaylistTab(page);
    await switcher(page, 'Mi lista').click();
    await expect(page.getByRole('menuitem', { name: 'Eliminar playlist' })).toBeDisabled();
  });
});
