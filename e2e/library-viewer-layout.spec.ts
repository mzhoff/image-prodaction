import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

test('Library viewer reserves metadata and actions before images load and across selections', async ({ page, context, baseURL }, testInfo) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'library-viewer-layout');
  await context.addCookies(owner.http.browserSessionCookies());
  const items = Array.from({ length: 3 }, (_, index) => {
    const id = `019a4567-0000-7000-8000-${String(index).padStart(12, '0')}`;
    return { id, workspaceId: owner.workspaceId, document: null, originalName: `Layout QA ${index}`,
      contentType: 'image/png', mediaKind: 'image', origin: index === 1 ? 'generated' : 'uploaded',
      provider: null, modelId: index === 1 ? 'qa-provider/a-very-long-model-name-that-must-not-wrap-to-another-line' : null,
      operation: null, width: index === 2 ? null : 900, height: index === 2 ? null : 1600,
      createdAt: new Date(0).toISOString(), contentUrl: `/api/assets/${id}/content`, thumbnailUrl: `/api/assets/${id}/content?variant=thumbnail` };
  });
  const picture = await sharp({ create: { width: 90, height: 160, channels: 3, background: '#847798' } }).png().toBuffer();
  let releaseOriginals = () => {};
  const originalsReady = new Promise<void>((resolve) => { releaseOriginals = resolve; });
  let originalRequests = 0; let paidRequests = 0;
  await page.route('**/api/ai/**', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    paidRequests++; return route.abort();
  });
  await page.route('**/api/assets?*', (route) => route.fulfill({ json: { items, nextCursor: null, facets: {} } }));
  await page.route('**/api/assets/*/content*', async (route) => {
    if (!new URL(route.request().url()).searchParams.has('variant')) {
      originalRequests++;
      await originalsReady;
    }
    await route.fulfill({ contentType: 'image/png', body: picture });
  });
  const viewer = page.locator('.image-viewer-content');
  const carousel = page.locator('.image-viewer-carousel');
  const meta = page.locator('.image-viewer-meta');
  const panel = page.locator('.image-editor-panel');
  const currentImage = page.locator('.image-viewer-media');
  const frame = () => carousel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { y: rect.y, height: rect.height };
  });
  const selectNext = async (index: number) => {
    await page.getByRole('button', { name: 'Next generated image' }).click();
    await expect(page).toHaveURL(`${origin.origin}/library/${items[index]!.id}`);
    await expect(viewer).not.toHaveClass(/image-viewer-content-moving/);
  };
  try {
    await page.goto(`/library/${items[0]!.id}`);
    await expect(carousel).toBeVisible();
    await expect.poll(() => currentImage.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(200);
    await expect.poll(() => originalRequests).toBeGreaterThan(0);
    expect(await currentImage.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(0);
    const emptyModelFrame = await frame();
    const toolbarFrame = await panel.boundingBox();
    await selectNext(1);
    // Uploaded and generated images have the same aspect ratio. Merely adding
    // the model label must never subtract 18px from the image viewport.
    expect(await frame()).toEqual(emptyModelFrame);
    expect(await panel.boundingBox()).toEqual(toolbarFrame);
    await expect(meta).toContainText('900 × 1600px');
    await expect(meta).toHaveCSS('height', '18px');
    await expect(panel).toHaveCSS('height', '44px');
    await expect(page.getByRole('button', { name: 'Скопировать ссылку', exact: true })).toBeVisible();
    const beforeDecode = await currentImage.boundingBox();
    releaseOriginals();
    await expect.poll(() => currentImage.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await currentImage.boundingBox()).toEqual(beforeDecode);
    expect(await frame()).toEqual(emptyModelFrame);
    await selectNext(2);
    await expect(meta).toBeEmpty();
    await expect(meta).toHaveCSS('height', '18px');
    expect(await frame()).toEqual(emptyModelFrame);
    expect(await panel.boundingBox()).toEqual(toolbarFrame);
    await page.screenshot({ path: testInfo.outputPath('reserved-empty-metadata.png') });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(carousel).toHaveCSS('width', '375px');
    // The responsive toolbar deliberately changes to two rows on resize.
    // Wait for that transition before comparing subsequent image selections.
    await expect(panel).toHaveCSS('height', '92px');
    const narrowFrame = await frame();
    await selectNext(0);
    await selectNext(1);
    expect(await frame()).toEqual(narrowFrame);
    await expect(meta.locator('.image-viewer-meta-model')).toHaveCSS('white-space', 'nowrap');
    await expect(meta).toHaveCSS('height', '18px');
    await expect(panel).toHaveCSS('height', '92px');
    await page.screenshot({ path: testInfo.outputPath('reserved-metadata-mobile.png') });
    expect(paidRequests).toBe(0);
  } finally {
    releaseOriginals();
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});
