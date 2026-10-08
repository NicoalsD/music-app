import {
  expect,
  importTones,
  openPlaylistTab,
  songButton,
  songOrder,
  test,
  tonePath,
} from './fixtures';
import type { ToneName } from './fixtures';
import type { Locator, Page } from '@playwright/test';

const play = (page: Page) => page.getByRole('button', { name: 'Reproducir', exact: true });
const pause = (page: Page) => page.getByRole('button', { name: 'Pausar', exact: true });

async function expectCurrent(page: Page, name: 'tone-a' | 'tone-b' | 'tone-c') {
  await expect(songButton(page, name)).toHaveAttribute('aria-current', 'true');
}

async function setup(page: Page) {
  await page.goto('./');
  await openPlaylistTab(page);
  await importTones(page, ['tone-a', 'tone-b', 'tone-c']);
  await expect.poll(() => songOrder(page)).toEqual(['tone-a', 'tone-b', 'tone-c']);
}

/**
 * Moves a row with the dnd-kit keyboard sensor: Space, one arrow per step, Space.
 * Each step is confirmed through the screen-reader announcement (the first arrow can be
 * swallowed while dnd-kit is still measuring, so a step is retried until it is announced).
 */
async function moveRow(page: Page, name: string, from: number, to: number, total = 3) {
  const handle = page.getByRole('button', { name: `Reordenar ${name}` });
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  const key = to < from ? 'ArrowUp' : 'ArrowDown';
  const step = to < from ? -1 : 1;
  for (let position = from + step; position !== to + step; position += step) {
    const announced = page.getByText(`${name} está ahora en la posición ${position} de ${total}.`);
    await expect(async () => {
      await page.keyboard.press(key);
      await expect(announced).toBeAttached({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
  }
  await page.keyboard.press('Space');
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('element has no box');
  return box;
}

/** Picks "item" from the import split-menu and answers the file chooser it opens. */
async function importFromMenu(page: Page, item: string, tone: ToneName) {
  await page.getByRole('button', { name: 'Más opciones de importación' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: item }).click();
  return { chooser, tone };
}

test.describe('playlist', () => {
  test('imports three files in order, plays the first and marks it current', async ({ page }) => {
    await setup(page);
    await expect(page.getByText('3 canciones').first()).toBeVisible();

    await play(page).click();
    await expect(pause(page)).toBeVisible();
    await expectCurrent(page, 'tone-a');
    await expect.poll(() => page.title()).toMatch(/^▶/);
  });

  test('next and previous walk through a, b and c', async ({ page }) => {
    await setup(page);
    await play(page).click();
    await expectCurrent(page, 'tone-a');

    await page.getByRole('button', { name: 'Siguiente canción' }).click();
    await expectCurrent(page, 'tone-b');
    await page.getByRole('button', { name: 'Siguiente canción' }).click();
    await expectCurrent(page, 'tone-c');
    await page.getByRole('button', { name: 'Canción anterior' }).click();
    await expectCurrent(page, 'tone-b');
    await page.getByRole('button', { name: 'Canción anterior' }).click();
    await expectCurrent(page, 'tone-a');
  });

  test('reordering moves a song to the start, the end and position 2', async ({ page }) => {
    // Keyboard drag (dnd-kit) is the third way to reorder, next to the import menu and the dialog.
    await setup(page);

    await moveRow(page, 'tone-c', 3, 1);
    await expect.poll(() => songOrder(page)).toEqual(['tone-c', 'tone-a', 'tone-b']);

    await moveRow(page, 'tone-c', 1, 3);
    await expect.poll(() => songOrder(page)).toEqual(['tone-a', 'tone-b', 'tone-c']);

    await moveRow(page, 'tone-c', 3, 2);
    await expect.poll(() => songOrder(page)).toEqual(['tone-a', 'tone-c', 'tone-b']);
  });

  test('removing the current song while playing plays the next one', async ({ page }) => {
    await setup(page);
    await play(page).click();
    await expectCurrent(page, 'tone-a');

    await page.getByRole('button', { name: 'Quitar tone-a de la lista' }).click();
    await expect.poll(() => songOrder(page)).toEqual(['tone-b', 'tone-c']);
    await expectCurrent(page, 'tone-b');
    await expect(pause(page)).toBeVisible();
  });

  test('auto-advances to the next song when the current one ends', async ({ page }) => {
    await setup(page);
    await play(page).click();
    await expectCurrent(page, 'tone-a');

    await expect(songButton(page, 'tone-b')).toHaveAttribute('aria-current', 'true', {
      timeout: 8_000,
    });
    await expect(pause(page)).toBeVisible();
  });

  test('repeat all wraps from the last song to the first', async ({ page }) => {
    await setup(page);
    await page.getByRole('button', { name: 'Repetir: desactivado' }).click();
    await expect(page.getByRole('button', { name: 'Repetir: toda la lista' })).toBeVisible();

    await songButton(page, 'tone-c').click();
    await expectCurrent(page, 'tone-c');
    await expect(songButton(page, 'tone-a')).toHaveAttribute('aria-current', 'true', {
      timeout: 10_000,
    });
  });

  test('undo restores a removed song at its original position', async ({ page }) => {
    await setup(page);
    await page.getByRole('button', { name: 'Quitar tone-b de la lista' }).click();
    await expect.poll(() => songOrder(page)).toEqual(['tone-a', 'tone-c']);

    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect.poll(() => songOrder(page)).toEqual(['tone-a', 'tone-b', 'tone-c']);
  });

  test('"Importar al inicio" puts the new file at position 1', async ({ page }) => {
    await setup(page);
    const { chooser, tone } = await importFromMenu(page, 'Importar al inicio', 'tone-a');
    await (await chooser).setFiles(tonePath(tone));
    await expect.poll(() => songOrder(page)).toEqual(['tone-a', 'tone-a', 'tone-b', 'tone-c']);
    await expect(page.getByText('4 canciones').first()).toBeVisible();
  });

  test('"Importar al final" from the menu appends the new file', async ({ page }) => {
    await setup(page);
    const { chooser, tone } = await importFromMenu(page, 'Importar al final', 'tone-c');
    await (await chooser).setFiles(tonePath(tone));
    await expect.poll(() => songOrder(page)).toEqual(['tone-a', 'tone-b', 'tone-c', 'tone-c']);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the row menu moves a song to the start without any dialog', async ({ page }) => {
    await setup(page);
    await page.getByRole('button', { name: 'Opciones de tone-c' }).click();
    await page.getByRole('menuitem', { name: 'Mover al inicio' }).click();
    await expect.poll(() => songOrder(page)).toEqual(['tone-c', 'tone-a', 'tone-b']);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Alt+ArrowUp moves the focused row up and keeps focus on it', async ({ page }) => {
    await setup(page);
    await songButton(page, 'tone-c').focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(() => songOrder(page)).toEqual(['tone-a', 'tone-c', 'tone-b']);
    await expect(songButton(page, 'tone-c')).toBeFocused();
    await expect(page.getByText('tone-c movida a la posición 2 de 3').first()).toBeAttached();
    await page.keyboard.press('Alt+Home');
    await expect.poll(() => songOrder(page)).toEqual(['tone-c', 'tone-a', 'tone-b']);
    await expect(songButton(page, 'tone-c')).toBeFocused();
  });

  test('dragging a row with the mouse reorders the list', async ({ page }) => {
    await setup(page);
    const source = await boxOf(songButton(page, 'tone-c'));
    const target = await boxOf(songButton(page, 'tone-a'));
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    // Small first move passes the 6px activation distance, then glide over the first row.
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 - 12, {
      steps: 3,
    });
    await page.mouse.move(target.x + target.width / 2, target.y + 4, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => songOrder(page)).toEqual(['tone-c', 'tone-a', 'tone-b']);
  });
});
