import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1200 } });
test('model ratio selector commits clicks, previews drags, retains sparse stops and works with keyboard and a narrow viewport', async ({ page, context, baseURL }) => {
  test.setTimeout(150_000);
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'aspect-ratio-selector');
  await context.addCookies(owner.http.browserSessionCookies());
  const documents = (['generateImage', 'generateVideo'] as const).map((type) => {
    const node = createDefaultNode(type, { x: 160, y: 35 });
    if (node.type === 'generateImage') node.data = { ...node.data, model: 'google/gemini-3.1-flash-image-preview', size: '2K', aspectRatio: '1:1' };
    const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [node], edges: [], assets: [] }, createEmptyProjectUiState());
    return { nodeId: node.id, id: randomUUID(), name: 'QA Aspect Ratio', workspaceId: owner.workspaceId, revision: 1,
      schemaVersion: snapshot.schemaVersion, snapshot, favorite: false, hasEverHadContent: true,
      status: 'active', thumbnailAvailable: false, thumbnailMode: 'auto', thumbnailUrl: '' };
  });
  let paidCalls = 0, catalogReads = 0;
  await page.route('**/api/ai/**', (route) => {
    if (route.request().method() === 'GET') { catalogReads++; return route.continue(); }
    paidCalls++; return route.abort();
  });
  for (const document of documents) {
    await page.route(`**/api/projects/${document.id}/thumbnail`, (route) => route.fulfill({ json: { project: document } }));
    await page.route(`**/api/projects/${document.id}`, (route) => {
      if (route.request().method() === 'PATCH') { document.snapshot = route.request().postDataJSON().snapshot; document.revision++; }
      return route.fulfill({ json: { project: document } });
    });
  }
  const savedRatio = (index: number) => {
    const data = documents[index].snapshot.project.nodes[0].data;
    return 'aspectRatio' in data ? data.aspectRatio : undefined;
  };
  const trigger = page.getByRole('button', { name: 'Aspect Ratio', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Выбор соотношения сторон', exact: true });
  const slider = dialog.getByRole('slider');
  const label = (ratio: string) => dialog.locator(`[data-aspect-ratio="${ratio}"]`);
  const point = async (ratio: string) => {
    const box = (await label(ratio).boundingBox())!, track = (await slider.boundingBox())!;
    return { x: box.x + box.width / 2, y: track.y + 22 };
  };
  const position = async (ratio: string) => label(ratio).evaluate((element) => element.style.left);
  try {
    await page.goto(`/projects/${documents[0].id}`);
    await expect(trigger).toBeEnabled(); await trigger.click();
    await expect(dialog.locator('.aspect-ratio-resolution')).toHaveText('2048 × 2048 px');
    const initialReads = catalogReads;
    const verticalPosition = await position('9:16'), horizontalPosition = await position('16:9');
    // A label click commits and dismisses; the saved document survives a reload.
    await label('4:5').click(); await expect(dialog).not.toBeVisible();
    await expect(trigger).toHaveText('4:5'); await expect.poll(() => savedRatio(0)).toBe('4:5');
    await page.reload(); await expect(trigger).toHaveText('4:5'); await trigger.click();
    await expect(dialog.locator('.aspect-ratio-resolution')).toHaveText('1856 × 2304 px');
    // Clicking the track at an available stop behaves like clicking its label.
    const square = await point('1:1'); await page.mouse.click(square.x, square.y);
    await expect(dialog).not.toBeVisible(); await expect(trigger).toHaveText('1:1');
    await expect.poll(() => savedRatio(0)).toBe('1:1');
    await trigger.click();
    const readsBeforeDrag = catalogReads;
    const start = await point('1:1'), vertical = await point('9:16'), horizontal = await point('16:9');
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(vertical.x, vertical.y, { steps: 8 });
    await expect(dialog.locator('.aspect-ratio-value')).toHaveText('9:16');
    await expect(dialog.locator('.aspect-ratio-resolution')).toHaveText('1536 × 2752 px');
    // Preview does not mutate the graph on every pointer movement.
    expect(savedRatio(0)).toBe('1:1'); await expect(trigger).toHaveText('1:1');
    await page.mouse.move(horizontal.x, horizontal.y, { steps: 12 });
    await expect(dialog.locator('.aspect-ratio-value')).toHaveText('16:9');
    await page.mouse.up();
    await expect(dialog).toBeVisible(); await expect(trigger).toHaveText('16:9');
    await expect.poll(() => savedRatio(0)).toBe('16:9');
    await expect(dialog.locator('.aspect-ratio-resolution')).toHaveText('2752 × 1536 px');
    await expect.poll(async () => (await dialog.locator('.aspect-ratio-preview').boundingBox())!.width).toBeCloseTo(35 * 16 / 9, 0);
    await expect(dialog.locator('.aspect-ratio-preview')).toHaveCSS('height', '35px');
    await expect(dialog.locator('.aspect-ratio-preview')).toHaveCSS('transition-duration', '0.2s');
    expect(catalogReads).toBe(readsBeforeDrag); expect(initialReads).toBeGreaterThan(0);
    if (process.env.ASPECT_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.ASPECT_SCREENSHOT_DIR}/image.png` });
    await page.mouse.click(20, 250); await expect(dialog).not.toBeVisible();
    // Keyboard selection commits in-place. Enter and Escape dismiss; focus returns to the field.
    await trigger.click(); await expect(slider).toBeFocused();
    await slider.press('ArrowLeft'); await expect(trigger).toHaveText('3:2'); await expect(dialog).toBeVisible();
    await slider.press('Enter'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
    await trigger.click(); await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
    // Pointer cancellation discards only the draft, including a canceled touch gesture.
    await trigger.click();
    const cancelStart = await point('3:2'), cancelEnd = await point('4:5');
    await page.mouse.move(cancelStart.x, cancelStart.y); await page.mouse.down();
    await page.mouse.move(cancelEnd.x, cancelEnd.y, { steps: 8 });
    await expect(dialog.locator('.aspect-ratio-value')).toHaveText('4:5');
    await slider.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'touch', isPrimary: true });
    await page.mouse.up();
    await expect(dialog).toBeVisible(); await expect(dialog.locator('.aspect-ratio-value')).toHaveText('3:2');
    await expect(trigger).toHaveText('3:2');
    await slider.press('Home'); await expect(trigger).toHaveText('1:8');
    await expect.poll(async () => (await dialog.locator('.aspect-ratio-preview').boundingBox())!.width).toBeCloseTo(35 / 8, 0);
    await expect(dialog.locator('.aspect-ratio-preview')).toHaveCSS('height', '35px');
    await slider.press('End'); await expect(trigger).toHaveText('8:1');
    await expect.poll(async () => (await dialog.locator('.aspect-ratio-preview').boundingBox())!.width).toBeCloseTo(280, 0);
    if (process.env.ASPECT_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.ASPECT_SCREENSHOT_DIR}/panoramic.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(dialog.locator('.aspect-ratio-preview')).toHaveCSS('transition-duration', '0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.keyboard.press('Escape');
    // Size changes update the lookup locally; unknown model mappings remain explicit.
    await page.locator('.setting-row').filter({ has: page.locator(':scope > span').filter({ hasText: /^Size$/ }) }).getByRole('button').click();
    await page.getByRole('option', { name: '4K', exact: true }).click();
    await trigger.click(); await expect(dialog.locator('.aspect-ratio-resolution')).toHaveText('12288 × 1536 px');
    await label('1:1').click();
    await page.getByRole('button', { name: 'Image model', exact: true }).click();
    await page.getByRole('button', { name: 'GPT Image 2', exact: true }).first().click();
    await trigger.click(); await expect(dialog.locator('.aspect-ratio-resolution')).toContainText(/размер по модели/i);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Image model', exact: true }).click();
    await page.getByRole('button', { name: 'Recraft V4', exact: true }).click();
    await trigger.click(); await expect(dialog.locator('.aspect-ratio-resolution')).toHaveText('1024 × 1024 px');
    await dialog.getByRole('button', { name: 'Auto', exact: true }).click();
    await expect(dialog).not.toBeVisible(); await expect(trigger).toHaveText('Auto');
    await trigger.click(); await expect(dialog.locator('.aspect-ratio-preview')).toHaveCount(0);
    await expect(dialog.locator('.aspect-ratio-resolution')).toHaveText('Размер по модели');
    await expect(dialog.locator('.aspect-ratio-thumb')).toHaveCount(0);
    await label('4:3').click(); await trigger.click();
    await expect(dialog.locator('.aspect-ratio-resolution')).toHaveText('1216 × 896 px');
    await page.keyboard.press('Escape');
    // The sparse video model keeps the same global coordinates and cannot select the hidden square.
    await page.goto(`/projects/${documents[1].id}`); await expect(trigger).toBeEnabled(); await trigger.click();
    await expect(dialog.locator('[data-aspect-ratio]')).toHaveCount(2);
    expect(await position('9:16')).toBe(verticalPosition); expect(await position('16:9')).toBe(horizontalPosition);
    await expect(label('1:1')).toHaveCount(0);
    await expect(dialog.locator('.aspect-ratio-resolution')).toHaveText('1280 × 720 px');
    await slider.press('Home'); await expect(trigger).toHaveText('9:16');
    await expect(dialog.locator('.aspect-ratio-resolution')).toHaveText('720 × 1280 px');
    await slider.press('ArrowRight'); await expect(trigger).toHaveText('16:9');
    if (process.env.ASPECT_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.ASPECT_SCREENSHOT_DIR}/video.png` });
    await slider.press('End'); await expect(trigger).toHaveText('16:9');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog).toBeVisible();
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(8); expect(bounds.x + bounds.width).toBeLessThanOrEqual(382);
    await label('9:16').scrollIntoViewIfNeeded(); await label('9:16').click();
    await expect(dialog).not.toBeVisible(); await expect.poll(() => savedRatio(1)).toBe('9:16');
    if (process.env.ASPECT_SCREENSHOT_DIR) {
      await trigger.click(); await page.screenshot({ path: `${process.env.ASPECT_SCREENSHOT_DIR}/narrow.png` });
    }
    expect(paidCalls).toBe(0);
  } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
});
