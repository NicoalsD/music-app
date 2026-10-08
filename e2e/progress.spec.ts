import { expect, importTones, test } from './fixtures';

test.describe('progress wire', () => {
  test('the swallow sits on the very start of the wire at 0:00 and on its end at the end', async ({
    page,
  }) => {
    await page.goto('./');
    await importTones(page, ['tone-a']);
    const player = page.getByLabel('Reproductor', { exact: true });
    const thumb = player.getByRole('slider', { name: 'Progreso de la canción' });
    const track = player.getByTestId('progress-track');
    await expect(thumb).toBeVisible();

    const start = await thumb.boundingBox();
    const wire = await track.boundingBox();
    if (start === null || wire === null) throw new Error('progress wire not rendered');
    const centre = (box: { x: number; width: number }) => box.x + box.width / 2;
    expect(Math.abs(centre(start) - wire.x)).toBeLessThanOrEqual(1);
    // The wire is a visible band, not a hairline.
    expect(wire.height).toBeGreaterThanOrEqual(4);

    // Scrub past the end without releasing: the swallow must stop exactly on the wire's end.
    await page.mouse.move(centre(start), start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(wire.x + wire.width + 40, start.y + start.height / 2, { steps: 8 });
    const end = await thumb.boundingBox();
    await page.mouse.up();
    if (end === null) throw new Error('progress thumb lost');
    expect(Math.abs(centre(end) - (wire.x + wire.width))).toBeLessThanOrEqual(1);
  });
});
