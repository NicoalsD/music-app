import { expect, importTones, openPlaylistTab, songOrder, test } from './fixtures';

test('volume, repeat mode and local-file hints survive a reload', async ({ page }) => {
  await page.goto('./');
  await openPlaylistTab(page);
  await importTones(page, ['tone-a', 'tone-b']);
  await expect.poll(() => songOrder(page)).toEqual(['tone-a', 'tone-b']);

  const volume = page.getByRole('slider', { name: 'Volumen' });
  await volume.focus();
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowLeft');
  await expect(volume).toHaveAttribute('aria-valuetext', '80 %');

  await page.getByRole('button', { name: 'Repetir: desactivado' }).click();
  await expect(page.getByRole('button', { name: 'Repetir: toda la lista' })).toBeVisible();

  // Persistence is debounced (300 ms): wait until it reaches storage.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('music-app:v1');
        if (raw === null) return null;
        const state = JSON.parse(raw) as { volume: number; repeat: string; playlists: unknown[] };
        return `${state.volume}|${state.repeat}`;
      }),
    )
    .toBe('0.8|all');

  await page.reload();
  await openPlaylistTab(page);

  await expect(page.getByRole('slider', { name: 'Volumen' })).toHaveAttribute(
    'aria-valuetext',
    '80 %',
  );
  await expect(page.getByRole('button', { name: 'Repetir: toda la lista' })).toBeVisible();
  const rows = page.getByRole('button', { name: /^Reproducir tone-/ });
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Vuelve a importar este archivo' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Reproducir tone-a' })).toBeDisabled();
});
