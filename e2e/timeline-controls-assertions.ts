import { expect, type Page } from '@playwright/test';

/** Real media seeks, pointer capture and shared Production UI controls. Called after importing three 1s scenes. */
export async function checkTimelineControls(page: Page) {
  const transport = page.getByRole('group', { name: 'Управление воспроизведением и историей' });
  await expect(transport.getByRole('button', { name: 'Отменить изменение' })).toBeVisible();
  await expect(page.locator('header').getByRole('button', { name: 'Отменить изменение' })).toHaveCount(0);
  const play = transport.getByRole('button', { name: 'Воспроизвести', exact: true });
  // Broad editor styles must not override the library's solid Play button.
  expect(await play.evaluate((button) => {
    const style = getComputedStyle(button), swatch = document.createElement('span');
    swatch.style.backgroundColor = style.getPropertyValue('--_pui-button-surface'); document.body.append(swatch);
    const matches = style.backgroundColor === getComputedStyle(swatch).backgroundColor; swatch.remove(); return matches;
  })).toBe(true);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await expect.poll(() => transport.getByRole('button', { name: 'Следующий кадр' }).evaluate((button) => {
    const style = getComputedStyle(button), swatch = document.createElement('span');
    swatch.style.color = style.getPropertyValue('--ink'); document.body.append(swatch);
    const matches = style.color === getComputedStyle(swatch).color; swatch.remove(); return matches;
  })).toBe(true);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  const zoom = page.getByRole('slider', { name: 'Масштаб таймлайна' });
  await expect(zoom).toHaveAttribute('data-shape', 'rect');
  await zoom.press('End'); await expect(zoom).toHaveAttribute('aria-valuenow', '120');
  const neutral = await zoom.evaluate((element) => {
    const root = element.closest('.pui-slider')!;
    return getComputedStyle(root).getPropertyValue('--pui-selection-control-track-selected').trim() === getComputedStyle(root).getPropertyValue('--ink-soft').trim();
  });
  expect(neutral).toBe(true);
  const needle = page.getByRole('slider', { name: 'Позиция на таймлайне' });
  const video = page.locator('video');
  const time = () => video.evaluate((element: HTMLVideoElement) => element.currentTime);
  const expectTime = async (seconds: number) => { await expect.poll(time).toBeCloseTo(seconds, 2); await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.seeking)).toBe(false); };
  await video.evaluate((element) => { element.dataset.seekIdentity = 'persistent'; });
  const origin = await page.getByRole('button', { name: 'Перейти к 0 секундам', exact: true }).evaluate((element) => element.parentElement!.getBoundingClientRect().left);
  const handle = (await needle.boundingBox())!;
  await page.mouse.move(origin + 4, handle.y + 7); await page.mouse.down();
  await page.mouse.move(origin + 48, handle.y + 7, { steps: 6 });
  await expect(needle).toHaveAttribute('aria-valuenow', '400'); await expectTime(0.4);
  await expect(video).toHaveAttribute('data-seek-identity', 'persistent');
  await page.mouse.move(origin + 72, handle.y + 7, { steps: 6 });
  await expectTime(0.6); await expect(video).toHaveAttribute('data-seek-identity', 'persistent');
  // Cross a cut while still holding the mouse, then return. No drop is needed to see the frame.
  await page.mouse.move(origin + 168, handle.y + 7, { steps: 6 });
  await expect(needle).toHaveAttribute('aria-valuenow', '1400'); await expectTime(1.4);
  await page.mouse.move(origin + 72, handle.y + 7, { steps: 6 }); await expectTime(0.6);
  await page.mouse.up();
  await transport.getByRole('button', { name: 'Следующая сцена' }).click(); await expectTime(1);
  await transport.getByRole('button', { name: 'Следующая сцена' }).click(); await expectTime(2);
  await transport.getByRole('button', { name: 'Предыдущая сцена' }).click(); await expectTime(1);
  await transport.getByRole('button', { name: 'Следующий кадр' }).click(); await expectTime(1 + 1 / 30);
  await transport.getByRole('button', { name: 'Предыдущий кадр' }).click(); await expectTime(1);
  await transport.getByRole('button', { name: 'В конец', exact: true }).click(); await expectTime(3 - 1 / 30);
  await expect(transport.getByRole('button', { name: 'Следующий кадр' })).toBeDisabled();
  await transport.getByRole('button', { name: 'В начало', exact: true }).click(); await expectTime(0);
  await needle.press('ArrowRight'); await expectTime(1 / 30);
  await needle.press('Home'); await expectTime(0);
  await transport.getByRole('button', { name: 'Воспроизвести', exact: true }).click(); await expect.poll(time).toBeGreaterThan(0.15);
  await transport.getByRole('button', { name: 'Пауза', exact: true }).click();
  const paused = await time(); await expect.poll(time).toBeCloseTo(paused, 2);
  await transport.getByRole('button', { name: 'Воспроизвести', exact: true }).click(); await expect.poll(time).toBeGreaterThan(paused + 0.1);
  // Re-seek to the same request (0), even though playback has since advanced.
  await transport.getByRole('button', { name: 'В начало', exact: true }).click(); await expectTime(0);
  await expect(transport.getByRole('button', { name: 'Воспроизвести', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/timeline-controls-ui-qa.png', fullPage: true });
  await zoom.press('Home'); for (let step = 0; step < 32; step++) await zoom.press('ArrowRight');
  await expect(zoom).toHaveAttribute('aria-valuenow', '36');
}
