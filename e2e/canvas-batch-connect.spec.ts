import { expect, test, type Page } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import type { GraphEdge, ProductionNode } from '../src/entities/production-graph/model/types';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

async function graphState(page: Page): Promise<{ nodes: ProductionNode[]; edges: GraphEdge[] }> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('reverie-image-production-project:v1')!).state);
}

async function selectNodes(page: Page, ids: string[]) {
  // Use the same Shift + pointer gesture as the canvas, without moving nodes.
  for (let i = 0; i < ids.length; i++) {
    await page.locator(`[data-node-id="${ids[i]}"]`).dispatchEvent('pointerdown', {
      button: 0, pointerId: 1, clientX: 100, clientY: 100, shiftKey: i > 0,
    });
    await page.locator('body').dispatchEvent('pointerup', { button: 0, pointerId: 1 });
  }
  await expect(page.locator('.production-node-selected')).toHaveCount(ids.length);
  await page.locator(`[data-node-id="${ids.at(-1)}"]`).evaluate((element) => element.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 600, clientY: 150 }),
  ));
}

test('batch menu intersects compatibility, lays out independent pairs, and undoes the whole click', async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(150_000);
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  const api = new URL(process.env.CANVAS_BATCH_API_URL ?? origin.origin);
  for (const url of [origin, api]) if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(api.origin, 'batch-connect');
  await context.addCookies(owner.http.browserSessionCookies().map((cookie) => ({ ...cookie, url: origin.origin })));
  await page.route('**/api/ai/**', (route) => route.request().method() === 'GET' ? route.continue() : route.abort());
  const openGraph = async (nodes: ProductionNode[]) => {
    const response = await owner.http.request('/api/projects', { json: { name: 'QA Batch connections', workspaceId: owner.workspaceId } });
    expect(response.status).toBe(201);
    const { project } = await response.json();
    const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes, edges: [], assets: [] }, createEmptyProjectUiState());
    expect((await owner.http.request(`/api/projects/${project.id}`, { method: 'PATCH', json: { expectedRevision: project.revision, snapshot } })).status).toBe(200);
    await page.goto(`/projects/${project.id}`);
    await expect(page.locator('.production-node')).toHaveCount(nodes.length);
  };
  const output = page.getByRole('button', { name: 'Add to output', exact: true });
  const input = page.getByRole('button', { name: 'Add to input', exact: true });
  try {
    const imports = [0, 1, 2].map((i) => createDefaultNode('importImage', { x: i * 370, y: 0 }));
    await openGraph(imports);
    await selectNodes(page, imports.map((node) => node.id));
    await expect(output).toBeEnabled();
    await expect(input).toBeDisabled();
    expect(await output.locator('.context-menu-help').count()).toBe(0);
    const chevron = (await input.locator('.context-menu-submenu-chevron').boundingBox())!;
    const help = (await input.locator('.context-menu-help').boundingBox())!;
    expect(help.x).toBeGreaterThan(chevron.x + chevron.width);
    expect(Math.abs(help.y + help.height / 2 - chevron.y - chevron.height / 2)).toBeLessThan(1);
    expect((await input.boundingBox())!.height).toBe((await output.boundingBox())!.height);
    await page.screenshot({ path: testInfo.outputPath('batch-menu-before-hover.png') });
    expect(help.x + help.width).toBeLessThan(1440);
    expect(help.y).toBeGreaterThanOrEqual(0);
    expect(help.y + help.height).toBeLessThan(1000);
    await input.locator('.pro-tooltip-trigger').hover();
    await expect(page.locator('.pro-tooltip')).toContainText('нет общей совместимой ноды для входа', { timeout: 1000 });
    await output.hover();
    const crop = page.getByRole('button', { name: 'Crop', exact: true });
    await expect(crop).toBeVisible();
    await expect(crop.locator('.context-menu-icon svg')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('batch-menu.png') });
    await crop.click();
    await expect(page.locator('.production-node-cropImage')).toHaveCount(3);
    let state = await graphState(page);
    expect(state.edges).toHaveLength(3);
    expect(new Set(state.edges.map((edge) => edge.targetNodeId)).size).toBe(3);
    expect(new Set(state.edges.map((edge) => edge.sourceNodeId)).size).toBe(3);
    await page.getByRole('button', { name: 'Zoom to fit', exact: true }).click();
    const boxes = await page.locator('.production-node').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]; const b = boxes[j];
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath('batch-crop-layout.png') });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.production-node-cropImage')).toHaveCount(0);
    state = await graphState(page);
    expect(state.edges).toEqual([]);
    expect(state.nodes.map(({ id, position }) => ({ id, position }))).toEqual(imports.map(({ id, position }) => ({ id, position })));
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('.production-node-cropImage')).toHaveCount(3);

    const crops = [0, 1].map((i) => createDefaultNode('cropImage', { x: i * 370, y: 0 }));
    await openGraph(crops);
    await selectNodes(page, crops.map((node) => node.id));
    await input.hover();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.locator('.production-node-importImage')).toHaveCount(2);
    state = await graphState(page);
    expect(state.edges).toHaveLength(2);
    expect(new Set(state.edges.map((edge) => edge.sourceNodeId)).size).toBe(2);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.production-node-importImage')).toHaveCount(0);

    const mixed = [createDefaultNode('importImage', { x: 0, y: 0 }), createDefaultNode('textPrompt', { x: 370, y: 0 })];
    await openGraph(mixed);
    await selectNodes(page, mixed.map((node) => node.id));
    await output.hover();
    await expect(page.getByRole('button', { name: 'Crop', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Generate image', exact: true })).toBeVisible();
  } finally {
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});
