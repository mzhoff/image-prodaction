import { gotoQaSection } from './release-user-fixture';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { PRODUCTION_NODE_TYPES } from '../src/entities/production-graph/model/node-registry';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import type { ProductionNodeType } from '../src/entities/production-graph/model/types';
import { createAudioQaOwner } from './audio-runtime-fixtures';
import { selectTheme } from './theme-control-fixture';

test.use({ channel: 'chrome', trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

async function openVisualFixture(page: Page, context: BrowserContext, baseURL?: string) {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only visual QA');
  const owner = await createAudioQaOwner(origin.origin, 'node-visual');
  await context.addCookies(owner.http.browserSessionCookies().map((cookie) => ({ ...cookie, url: origin.origin })));
  await page.route('**/api/ai/**', (route) => route.request().method() === 'GET' ? route.continue() : route.abort());
  await page.route('**/api/chat/v1/turn**', (route) => route.abort());
  const types: ProductionNodeType[] = ['textGeneration', 'textConcat', ...PRODUCTION_NODE_TYPES.filter((type) => !['textGeneration', 'textConcat'].includes(type))];
  const nodes = types.map((type, i) => createDefaultNode(type, { x: (i % 4) * 430, y: Math.floor(i / 4) * 1100 }));
  // Cover even legacy favorites that are no longer offered in the add menu.
  await page.route('**/api/node-favorites?*', (route) => route.fulfill({ json: {
    favorites: nodes.map((node) => ({ id: node.id, workspaceId: owner.workspaceId,
      createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z', fingerprint: node.id,
      snapshot: { nodeType: node.type, data: node.data, version: 1 } })),
  } }));
  const created = await owner.http.request('/api/projects', { json: { name: 'QA Node visual contract', workspaceId: owner.workspaceId } });
  expect(created.status).toBe(201);
  const { project } = await created.json();
  const ui = { ...createEmptyProjectUiState(), viewport: { x: 40, y: 90, zoom: 1 } };
  const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes, edges: [], assets: [] }, ui);
  expect((await owner.http.request(`/api/projects/${project.id}`, { method: 'PATCH', json: { snapshot, expectedRevision: project.revision } })).status).toBe(200);
  await gotoQaSection(page, `/projects/${project.id}`);
  await expect(page.locator('.production-node')).toHaveCount(nodes.length);
  // Opening a document auto-fits all 33 cards. Zoom/pan through the canvas's
  // normal wheel gestures so the first card can be edited at a readable scale.
  const canvas = page.locator('.production-canvas');
  await expect(page.getByLabel('Canvas zoom', { exact: true })).toHaveText('10%');
  const scale = await page.locator('.canvas-world').evaluate((world) => new DOMMatrixReadOnly(getComputedStyle(world).transform).a);
  let first = (await page.locator('.production-node-textGeneration').boundingBox())!;
  // Hold the physical modifier: Ctrl on an event alone models accelerated touchpad pinch.
  await page.keyboard.down('Control');
  await canvas.dispatchEvent('wheel', { ctrlKey: true, deltaY: (1 - 1 / scale) / 0.001, clientX: first.x, clientY: first.y });
  await page.keyboard.up('Control');
  await expect(page.getByLabel('Canvas zoom', { exact: true })).toHaveText('100%');
  first = (await page.locator('.production-node-textGeneration').boundingBox())!;
  await canvas.dispatchEvent('wheel', { deltaX: (first.x - 40) / 1.3, deltaY: 0 });
  await canvas.dispatchEvent('wheel', { deltaY: (first.y - 90) / 1.3, deltaX: 0 });
  return owner;
}

async function overflowingFields(page: Page) {
  return page.locator('.production-node textarea').evaluateAll((fields) => fields.flatMap((field) => {
    const box = field.getBoundingClientRect();
    if (!box.width || !box.height) return [];
    const node = field.closest<HTMLElement>('.production-node')!;
    const card = node.getBoundingClientRect();
    const parent = field.parentElement!.getBoundingClientRect();
    const overflow = box.left < Math.max(card.left, parent.left) - 1 || box.right > Math.min(card.right, parent.right) + 1;
    return overflow ? [{ node: node.dataset.nodeId, field: field.className, width: box.width, parentWidth: parent.width }] : [];
  }));
}

test('textareas stay inside every node and inset section, including focus and vertical resize', async ({ page, context, baseURL }, info) => {
  const owner = await openVisualFixture(page, context, baseURL);
  try {
    const prompt = page.locator('.production-node-textGeneration textarea.prompt-box');
    for (const theme of ['light', 'dark'] as const) {
      await selectTheme(page, theme);
      await expect.poll(() => overflowingFields(page)).toEqual([]);
      await prompt.fill('Длинный промпт без потери отступов. '.repeat(40) + 'x'.repeat(600));
      await expect(prompt).toBeFocused();
      await expect(prompt).toHaveCSS('box-sizing', 'border-box');
      await expect(prompt).toHaveCSS('resize', 'vertical');
      const geometry = await prompt.evaluate((field) => {
        const style = getComputedStyle(field);
        return { width: parseFloat(style.width), left: parseFloat(style.marginLeft), right: parseFloat(style.marginRight), parentWidth: field.parentElement!.clientWidth };
      });
      expect(Math.abs(geometry.width + geometry.left + geometry.right - geometry.parentWidth)).toBeLessThanOrEqual(1);
      await expect.poll(() => overflowingFields(page)).toEqual([]);
      await page.locator('.production-node-textGeneration').screenshot({ path: info.outputPath(`text-generation-${theme}.png`) });
    }
    const before = (await prompt.boundingBox())!;
    await page.mouse.move(before.x + before.width - 4, before.y + before.height - 4);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width + 90, before.y + before.height + 65, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await prompt.boundingBox())!.height).toBeGreaterThan(before.height + 20);
    expect((await prompt.boundingBox())!.width).toBeCloseTo(before.width, 0);
    await expect.poll(() => overflowingFields(page)).toEqual([]);
    await page.setViewportSize({ width: 840, height: 900 });
    await expect.poll(() => overflowingFields(page)).toEqual([]);
  } finally {
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});

test('all node types have unique icons shared by headers, palette and connection menus, independent of rename', async ({ page, context, baseURL }, info) => {
  const owner = await openVisualFixture(page, context, baseURL);
  try {
    const headerIcons = new Map<string, string>();
    for (const type of PRODUCTION_NODE_TYPES) {
      const icon = page.locator(`.production-node-${type} svg[data-node-icon="${type}"]`).first();
      await expect(icon).toHaveCount(1);
      headerIcons.set(type, await icon.innerHTML());
    }
    expect(new Set(headerIcons.values()).size).toBe(PRODUCTION_NODE_TYPES.length);
    for (const [type, shape] of headerIcons) {
      const paletteIcon = page.locator(`.document-node-palette svg[data-node-icon="${type}"]`).first();
      // Legacy Reference composer is deliberately not addable in the palette.
      if (type === 'referenceComposer') continue;
      await expect(paletteIcon).toHaveCount(1);
      expect(await paletteIcon.innerHTML()).toBe(shape);
    }
    const title = page.locator('.production-node-textGeneration .node-title-editable-label');
    await title.dblclick();
    const titleInput = page.locator('.production-node-textGeneration .node-title-input');
    await titleInput.fill('Formatter');
    await titleInput.press('Enter');
    expect(await page.locator('.production-node-textGeneration svg[data-node-icon]').first().innerHTML()).toBe(headerIcons.get('textGeneration'));

    await page.locator('.production-canvas').evaluate((element) => element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: 800, clientY: 100,
    })));
    await page.getByRole('button', { name: 'Text', exact: true }).hover();
    for (const type of ['textPrompt', 'textConcat', 'textGeneration', 'textFormatter', 'textSplitter']) {
      const icon = page.locator(`.context-menu svg[data-node-icon="${type}"]`);
      await expect(icon).toBeVisible();
      expect(await icon.innerHTML()).toBe(headerIcons.get(type));
    }
    await page.screenshot({ path: info.outputPath('text-menu-distinct-icons.png') });
    await page.keyboard.press('Escape');
    const node = page.locator('.production-node-textGeneration');
    await node.evaluate((element) => element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: 700, clientY: 100,
    })));
    await page.getByRole('button', { name: 'Add to output', exact: true }).hover();
    const connectedIcons = page.locator('.context-menu svg[data-node-icon]');
    expect(await connectedIcons.count()).toBeGreaterThan(1);
    for (const icon of await connectedIcons.all()) {
      expect(await icon.innerHTML()).toBe(headerIcons.get((await icon.getAttribute('data-node-icon'))!));
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open node palette', exact: true }).click();
    await page.getByRole('tab', { name: 'Favorite', exact: true }).click();
    for (const [type, shape] of headerIcons) {
      const favoriteIcon = page.locator(`.document-node-palette-favorite-card svg[data-node-icon="${type}"]`);
      await expect(favoriteIcon).toHaveCount(1);
      expect(await favoriteIcon.innerHTML()).toBe(shape);
    }
  } finally {
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});
