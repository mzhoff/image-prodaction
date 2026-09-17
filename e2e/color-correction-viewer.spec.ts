import { expect, test, type Locator } from '@playwright/test';
import sharp from 'sharp';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import type { AssetRecord } from '../src/entities/production-graph/model/types';
import { audioQaForm, createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1600, height: 1000 } });

test('Curves and Adjustments share fullscreen side tools; masks stay below and values survive reopening', async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(150_000);
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only color QA');
  const owner = await createAudioQaOwner(origin.origin, 'color-viewer');
  await context.addCookies(owner.http.browserSessionCookies());
  let paidCalls = 0;
  await page.route('**/api/ai/**', route => {
    if (route.request().method() === 'GET') return route.continue();
    paidCalls++; return route.abort();
  });
  const bytes = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1350"><defs><linearGradient id="g"><stop stop-color="#c67772"/><stop offset="1" stop-color="#1c3e64"/></linearGradient></defs><rect width="900" height="1350" fill="url(#g)"/><circle cx="450" cy="450" r="240" fill="#92744b"/><rect x="180" y="740" width="540" height="400" rx="40" fill="#576949"/></svg>')).png().toBuffer();
  const uploaded = await owner.http.request('/api/assets/images', { form: audioQaForm(bytes, owner.workspaceId, true) });
  expect(uploaded.status).toBe(201);
  const remote = (await uploaded.json()).asset;
  const asset: AssetRecord = { id: remote.id, kind: 'image', name: 'Color QA.png', mimeType: 'image/png',
    width: 900, height: 1350, createdAt: remote.createdAt, storage: { type: 'remote', assetId: remote.id } };
  const input = createDefaultNode('importImage', { x: 20, y: 80 });
  input.data = { ...input.data, assetId: asset.id };
  const curves = createDefaultNode('curves', { x: 440, y: 80 });
  const adjustment = createDefaultNode('adjustment', { x: 860, y: 80 });
  const generate = createDefaultNode('generateImage', { x: 1280, y: 80 });
  generate.data = { ...generate.data, resultAssetId: asset.id, resultAssetIds: [asset.id], aspectRatio: '2:3' };
  const project = { ...structuredClone(initialProject), nodes: [input, curves, adjustment, generate], assets: [asset],
    edges: [curves, adjustment].map(node => ({ id: `edge-${node.id}`, sourceNodeId: input.id, sourcePortId: 'image', targetNodeId: node.id, targetPortId: 'image' })) };
  const created = await owner.http.request('/api/projects', { json: { name: 'Color viewer QA', workspaceId: owner.workspaceId } });
  expect(created.status).toBe(201);
  const document = (await created.json()).project;
  const ui = createEmptyProjectUiState(); ui.viewport = { x: 20, y: 70, zoom: 0.8 };
  expect((await owner.http.request(`/api/projects/${document.id}`, { method: 'PATCH', json: {
    expectedRevision: document.revision, snapshot: createProjectExport(project, ui),
  } })).status).toBe(200);
  const card = (id: string) => page.locator(`article[data-node-id="${id}"]`);
  const viewer = page.getByRole('dialog', { name: 'Image viewer', exact: true });
  const stage = viewer.locator('.image-viewer-stage');
  const sidebar = viewer.locator('.image-editor-sidebar');
  const assertSide = async (screenWidth: number, screenHeight: number) => {
    const image = (await stage.boundingBox())!;
    const tools = (await sidebar.boundingBox())!;
    expect(tools.x).toBeGreaterThan(image.x + image.width);
    expect(tools.x - image.x - image.width).toBeLessThan(24);
    expect(tools.x + tools.width).toBeLessThanOrEqual(screenWidth);
    expect(tools.y + tools.height).toBeLessThanOrEqual(screenHeight);
    expect(tools.y).toBeGreaterThanOrEqual(76);
    expect(image.y + image.height).toBeLessThanOrEqual(screenHeight);
  };
  try {
    await page.goto(`/projects/${document.id}`);
    await card(curves.id).locator('.image-plate').click();
    // This assertion rejects an older Docker bundle that still embeds its own viewer.
    await expect(viewer).toHaveClass(/pui-media-viewer/);
    await expect(sidebar).toHaveAttribute('aria-label', 'Curves');
    await assertSide(1600, 1000);
    await page.setViewportSize({ width: 2560, height: 1440 });
    await assertSide(2560, 1440);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const fullImage = (await stage.boundingBox())!;
    expect(fullImage.height).toBeGreaterThan(850);
    expect(fullImage.x + fullImage.width / 2).toBeCloseTo(800, 0);
    // No letterboxing inside the interactive SVG: pointer coordinates match its square.
    const graph = sidebar.getByRole('application', { name: 'RGB tone curve' });
    const graphBox = (await graph.boundingBox())!;
    expect(graphBox.width).toBeCloseTo(graphBox.height, 0);
    const initialPoints = await graph.locator('circle').count();
    await graph.click({ position: { x: graphBox.width * 0.45, y: graphBox.height * 0.35 } });
    await expect(graph.locator('circle')).toHaveCount(initialPoints + 1);
    await sidebar.getByRole('slider', { name: 'Curves opacity' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(sidebar.getByRole('slider', { name: 'Curves opacity' })).toHaveValue('99');
    await viewer.getByRole('button', { name: 'Mask', exact: true }).click();
    const maskTools = viewer.locator('.image-editor-mask-tools');
    await expect(maskTools).toBeVisible();
    expect((await maskTools.boundingBox())!.y).toBeGreaterThanOrEqual(fullImage.y + fullImage.height);
    await assertSide(1600, 1000);
    const maskCanvas = viewer.locator('.image-mask-canvas');
    const canvasBox = (await maskCanvas.boundingBox())!;
    const stageBox = (await stage.boundingBox())!;
    expect(canvasBox.x).toBeCloseTo(stageBox.x, 0);
    expect(canvasBox.y).toBeCloseTo(stageBox.y, 0);
    expect(canvasBox.width).toBeCloseTo(stageBox.width, 0);
    expect(canvasBox.height).toBeCloseTo(stageBox.height, 0);
    const emptyMask = await maskCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.45, canvasBox.y + canvasBox.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.55, canvasBox.y + canvasBox.height * 0.5, { steps: 4 });
    await page.mouse.up();
    const drawnMask = await maskCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    expect(drawnMask).not.toBe(emptyMask);
    await viewer.getByRole('button', { name: 'Mask', exact: true }).click();
    await expect(maskTools).toHaveCount(0);
    await expect(maskCanvas).toHaveCount(1);
    await viewer.getByRole('button', { name: 'Mask', exact: true }).click();
    await expect(maskTools).toBeVisible();
    expect(await maskCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(drawnMask);
    await viewer.getByRole('button', { name: 'Clear mask', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('curves-right-desktop.png') });
    await viewer.locator('.image-viewer-close').click();
    await expect(card(curves.id).getByRole('slider', { name: 'Curves opacity' })).toHaveValue('99');
    await card(curves.id).locator('.image-plate').click();
    await expect(graph.locator('circle')).toHaveCount(initialPoints + 1);
    await sidebar.getByRole('button', { name: 'Reset active curve' }).click();
    await expect(graph.locator('circle')).toHaveCount(initialPoints);
    // Responsive tools remain reachable and do not cover image / close.
    await page.setViewportSize({ width: 960, height: 640 });
    await assertSide(960, 640);
    await page.setViewportSize({ width: 390, height: 844 });
    const phoneImage = (await stage.boundingBox())!;
    const phoneTools = (await sidebar.boundingBox())!;
    expect(phoneTools.y).toBeGreaterThan(phoneImage.y + phoneImage.height);
    expect(phoneTools.x).toBeGreaterThanOrEqual(0);
    expect(phoneTools.x + phoneTools.width).toBeLessThanOrEqual(390);
    expect(phoneTools.y + phoneTools.height).toBeLessThanOrEqual(844);
    await sidebar.getByRole('slider', { name: 'Curves opacity' }).scrollIntoViewIfNeeded();
    await expect(sidebar.getByRole('slider', { name: 'Curves opacity' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('curves-phone.png') });
    // The optional Visual Intent proxy toolbar covers the mobile close button.
    // Desktop exercises pointer close; this also verifies the viewer's Escape path.
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);

    await page.setViewportSize({ width: 1600, height: 1000 });
    await card(adjustment.id).locator('.image-plate').first().hover();
    await card(adjustment.id).getByRole('button', { name: 'Open image', exact: true }).click();
    await expect(sidebar).toHaveAttribute('aria-label', 'Adjustments');
    await expect(sidebar.getByRole('slider')).toHaveCount(8);
    await assertSide(1600, 1000);
    expect((await stage.boundingBox())!.height).toBeGreaterThan(880);
    const preview = viewer.getByRole('img', { name: 'Adjusted image preview' });
    await expect.poll(() => preview.locator('canvas').first().evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(560);
    const before = await preview.screenshot();
    const exposure = sidebar.getByRole('slider', { name: 'Exposure', exact: true });
    await exposure.focus();
    for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowRight');
    await expect(exposure).toHaveValue('25');
    const save = viewer.getByRole('button', { name: 'Сохранить в библиотеку', exact: true });
    await expect(save).toBeDisabled();
    await expect(card(adjustment.id).getByRole('slider', { name: 'Exposure', exact: true })).toHaveValue('25');
    expect((await preview.screenshot()).equals(before)).toBe(false);
    await expect(save).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('adjustments-right-desktop.png') });
    await viewer.locator('.image-viewer-close').click();
    await card(adjustment.id).locator('.image-plate').first().click();
    await expect(exposure).toHaveValue('25');
    await sidebar.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(exposure).toHaveValue('0');
    await page.setViewportSize({ width: 390, height: 844 });
    await sidebar.getByRole('button', { name: 'Reset', exact: true }).scrollIntoViewIfNeeded();
    await withinScreen(sidebar, 390, 844);
    await page.screenshot({ path: testInfo.outputPath('adjustments-phone.png') });
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);

    // Generate Image still opens its mask + text-request editor below, with no sidebar.
    await page.setViewportSize({ width: 1600, height: 1000 });
    await card(generate.id).locator('.image-plate').click();
    await expect(sidebar).toHaveCount(0);
    await viewer.getByRole('button', { name: 'Mask', exact: true }).click();
    await expect(viewer.locator('.image-editor-prompt')).toBeVisible();
    expect((await viewer.locator('.image-editor-input-area').boundingBox())!.y)
      .toBeGreaterThan((await stage.boundingBox())!.y + (await stage.boundingBox())!.height);
    await withinScreen(viewer.locator('.image-editor-input-area'), 1600, 1000);
    await viewer.locator('.image-viewer-close').click();
    await expect.poll(async () => {
      const saved = (await (await owner.http.request(`/api/projects/${document.id}`)).json()).project.snapshot;
      return saved.project.nodes.find((node: { id: string }) => node.id === curves.id).data.opacity;
    }).toBe(99);
    await page.reload();
    await expect(card(curves.id).getByRole('slider', { name: 'Curves opacity' })).toHaveValue('99');
    expect(paidCalls).toBe(0);
  } finally {
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});

async function withinScreen(locator: Locator, width: number, height: number) {
  // Opening the bottom mask/prompt panel transitions its reserved height.
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    return Boolean(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height);
  }).toBe(true);
}
