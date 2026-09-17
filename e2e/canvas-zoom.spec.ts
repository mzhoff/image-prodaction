import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState } from '../src/entities/production-graph/model/project-schema';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

test('toolbar reports canvas scale and enforces 135% for gestures and restored viewports', async ({ page, context, baseURL }, testInfo) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Canvas QA is local-only.');
  const owner = await createAudioQaOwner(origin.origin, 'canvas-zoom');
  await context.addCookies(owner.http.browserSessionCookies());
  const state = { ...structuredClone(initialProject),
    nodes: [createDefaultNode('textPrompt', { x: 0, y: 0 })],
    assets: [], edges: [], uiState: createEmptyProjectUiState() };
  await page.addInitScript((seed: string) => {
    if (!localStorage.getItem('reverie-image-production-project:v1')) {
      localStorage.setItem('reverie-image-production-project:v1', seed);
    }
  }, JSON.stringify({ state, version: 0 }));

  const indicator = page.getByLabel('Canvas zoom', { exact: true });
  const canvas = page.locator('.production-canvas');
  const actualPercent = () => page.locator('.canvas-world').evaluate((world) => (
    `${Math.round(new DOMMatrixReadOnly(getComputedStyle(world).transform).a * 100)}%`
  ));
  const checkScale = async () => {
    await expect.poll(async () => (await indicator.textContent())?.trim()).toBe(await actualPercent());
  };
  const zoomBy = (deltaY: number) => canvas.dispatchEvent('wheel', {
    deltaY, ctrlKey: true, clientX: 700, clientY: 450,
  });

  try {
    await page.goto('/editor');
    await expect(page.locator('[data-node-id]')).toHaveCount(1);
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveText('115%');
    await checkScale();
    const initialBox = (await indicator.boundingBox())!;

    await zoomBy(-40);
    await expect(indicator).toHaveText('120%');
    await checkScale();
    await zoomBy(200);
    await expect(indicator).toHaveText('96%');
    await checkScale();

    await zoomBy(-100_000);
    await expect(indicator).toHaveText('135%');
    await checkScale();
    await zoomBy(-200);
    await expect(indicator).toHaveText('135%');
    await canvas.dispatchEvent('wheel', { deltaY: -200, metaKey: true, clientX: 700, clientY: 450 });
    await expect(indicator).toHaveText('135%');
    expect(await page.locator('.canvas-world').evaluate((world) => (
      new DOMMatrixReadOnly(getComputedStyle(world).transform).a
    ))).toBe(1.35);
    await checkScale();
    await zoomBy(100_000);
    await expect(indicator).toHaveText('10%');
    await checkScale();
    expect((await indicator.boundingBox())!.width).toBe(initialBox.width);
    expect((await indicator.boundingBox())!.height).toBe(initialBox.height);

    await canvas.dispatchEvent('wheel', { deltaY: 50, clientX: 700, clientY: 450 });
    await expect(indicator).toHaveText('10%');
    await checkScale();
    await page.getByRole('button', { name: 'Zoom to fit', exact: true }).click();
    await expect(indicator).toHaveText('115%');
    await checkScale();

    await page.reload();
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveText('115%');
    await checkScale();
    await page.locator('.canvas-toolbar').screenshot({ path: testInfo.outputPath('zoom-toolbar.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    const toolbar = (await page.locator('.canvas-toolbar').boundingBox())!;
    expect(toolbar.x).toBeGreaterThanOrEqual(0);
    expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(390);
    await expect(indicator).toBeVisible();

    // An empty canvas skips auto-fit. Hydration may use the default viewport;
    // neither that path nor restoring legacy data may exceed the new cap.
    await page.evaluate(() => {
      const key = 'reverie-image-production-project:v1';
      const stored = JSON.parse(localStorage.getItem(key)!);
      stored.state.nodes = [];
      stored.state.uiState.viewport.zoom = 2.4;
      localStorage.setItem(key, JSON.stringify(stored));
    });
    await page.reload();
    await expect(page.locator('[data-node-id]')).toHaveCount(0);
    await expect(indicator).toBeVisible();
    await checkScale();
    expect(await page.locator('.canvas-world').evaluate((world) => (
      new DOMMatrixReadOnly(getComputedStyle(world).transform).a
    ))).toBeLessThanOrEqual(1.35);
  } finally {
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});
