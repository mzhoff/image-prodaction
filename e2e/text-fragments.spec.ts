import { expect, test, type Locator, type Page, type BrowserContext } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState } from '../src/entities/production-graph/model/project-schema';
import type { ProductionNode } from '../src/entities/production-graph/model/types';
import { createTelegramEditorValueFromSegments } from '../src/modules/telegram-formatting/core';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1600, height: 1050 } });
const KEY = 'reverie-image-production-project:v1';
const empty = { x: 720, y: 870 };
const card = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const cards = (page: Page) => page.locator('.production-node[data-node-id]');
const badge = (page: Page, id: string, label: string) => card(page, id).locator(`[data-text-fragment-handle][data-text-section-label="${label}"]`);
async function snapshot(page: Page) { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY); }
async function storedText(page: Page, id: string, field = 'text') {
  return (await snapshot(page)).nodes.find((node: ProductionNode) => node.id === id)?.data[field];
}
async function center(locator: Locator) {
  const box = (await locator.boundingBox())!;
  expect(box).toBeTruthy();
  return { x: box.x + box.width / 2, y: box.y + Math.min(18, box.height / 2) };
}
async function selectedPoint(editor: Locator, start: number, end: number) {
  return editor.evaluate((root, { start, end }) => {
    (root as HTMLElement).focus();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts: Text[] = []; let current: Node | null;
    while ((current = walker.nextNode())) texts.push(current as Text);
    const point = (offset: number) => {
      for (const text of texts) { if (offset <= text.length) return { text, offset }; offset -= text.length; }
      throw new Error('Selection offset outside text');
    };
    const a = point(start); const b = point(end); const range = document.createRange();
    range.setStart(a.text, a.offset); range.setEnd(b.text, b.offset);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    const rect = range.getClientRects()[0];
    return { x: rect.x + Math.min(rect.width / 2, 25), y: rect.y + rect.height / 2 };
  }, { start, end });
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, copy = false, held?: () => Promise<void>) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.waitForTimeout(200); // Real Chromium selection drag needs a deliberate grab.
  await page.mouse.move(from.x + 12, from.y, { steps: 3 });
  if (copy) await page.keyboard.down('Alt');
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await held?.(); await page.mouse.up();
  if (copy) await page.keyboard.up('Alt');
}
async function setup(page: Page, context: BrowserContext, baseURL: string | undefined, nodes?: ProductionNode[]) {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'text-fragments');
  await context.addCookies(owner.http.browserSessionCookies());
  await page.route('**/api/ai/**', (route) => route.abort());
  const a = createDefaultNode('textPrompt', { x: 0, y: 0 });
  a.id = 'fragment-source'; a.data = { ...a.data, text: 'First fragment last\n\n[ACTORS]\nOne\n\n[STYLE]\nBlue' };
  const b = createDefaultNode('textPrompt', { x: 480, y: 0 });
  b.id = 'fragment-target'; b.data = { ...b.data, text: '[ACTORS]\nTwo', presentation: 'bubble' };
  const extract = createDefaultNode('imageToText', { x: 960, y: 0 });
  extract.id = 'fragment-extract'; extract.data = { ...extract.data, prompt: 'Analyze', result: '[ACTORS]\nRepeated words.\n\n[STYLE]\nRepeated words.', disabledLayerIds: [] };
  const state = { ...structuredClone(initialProject), nodes: nodes ?? [a, b, extract], edges: [], assets: [], uiState: createEmptyProjectUiState() };
  await page.addInitScript((seed: string) => {
    const key = 'reverie-image-production-project:v1';
    if (!localStorage.getItem(key)) localStorage.setItem(key, seed);
    const metrics = { writes: 0 }; Object.assign(window, { fragmentDragMetrics: metrics });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) metrics.writes++;
      return original.call(this, name, value);
    };
  }, JSON.stringify({ state, version: 0 }));
  await page.goto('/editor');
  await expect(cards(page)).toHaveCount(state.nodes.length);
  await page.waitForTimeout(1000); // Initial auto-fit and derived model writes.
  return { a, b, extract, owner };
}
async function undo(page: Page) { await page.getByRole('button', { name: 'Undo', exact: true }).click(); }

test('badges above editors, opaque moving Prompt, atomic transfer, merge and legacy reload', async ({ page, context, baseURL }, info) => {
  const { a, b, owner } = await setup(page, context, baseURL);
  try {
    await expect(page.locator('[data-text-bubble],.text-fragment-bubble')).toHaveCount(0);
    await expect(card(page, b.id).locator('.text-prompt-variable-content')).toBeVisible();
    expect((await snapshot(page)).nodes.find((n: ProductionNode) => n.id === b.id).data.presentation).toBe('card');
    const chip = badge(page, a.id, 'ACTORS');
    const tagBox = (await chip.boundingBox())!;
    const editorBox = (await card(page, a.id).locator('.text-prompt-main-box').boundingBox())!;
    expect(tagBox.y + tagBox.height).toBeLessThanOrEqual(editorBox.y);
    const original = await snapshot(page);
    await page.evaluate(() => { (window as unknown as { fragmentDragMetrics: { writes: number } }).fragmentDragMetrics.writes = 0; });
    let landing: { x: number; y: number };
    await drag(page, await center(chip), empty, false, async () => {
      const preview = page.locator('.text-fragment-drag-preview > .production-node');
      await expect(preview).toBeVisible();
      await expect(preview).toContainText('Prompt');
      await expect(preview).toContainText('[ACTORS]');
      await expect(preview).toHaveCSS('opacity', '1');
      await expect(page.locator('.text-fragment-drop-hint')).toHaveText('Создать Prompt');
      const before = (await preview.boundingBox())!;
      await page.mouse.move(empty.x + 65, empty.y - 35, { steps: 8 });
      await expect.poll(async () => Math.round((await preview.boundingBox())!.x - before.x)).toBe(65);
      const after = (await preview.boundingBox())!; landing = after;
      expect(Math.round(after.y - before.y)).toBe(-35);
      expect(await page.evaluate(() => (window as unknown as { fragmentDragMetrics: { writes: number } }).fragmentDragMetrics.writes)).toBe(0);
      expect((await snapshot(page)).nodes).toEqual(original.nodes);
      await page.screenshot({ path: info.outputPath('prompt-during-drag.png') });
      await page.waitForTimeout(600); // Holding still must not turn the drop into a filter click.
    });
    await expect(page.locator('.text-fragment-drag-preview')).toHaveCount(0);
    await expect(cards(page)).toHaveCount(4);
    await expect.poll(() => storedText(page, a.id)).not.toContain('[ACTORS]');
    const added = (await snapshot(page)).nodes.at(-1);
    expect(added.type).toBe('textPrompt'); expect(added.data.presentation).toBe('card');
    const addedBox = (await card(page, added.id).boundingBox())!;
    expect(Math.abs(addedBox.x - landing!.x)).toBeLessThan(2);
    expect(Math.abs(addedBox.y - landing!.y)).toBeLessThan(2);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(cards(page)).toHaveCount(3);
    await expect.poll(() => storedText(page, a.id)).toBe(original.nodes[0].data.text);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(cards(page)).toHaveCount(4);
    await drag(page, await center(badge(page, added.id, 'ACTORS')), await center(badge(page, b.id, 'ACTORS')));
    await expect.poll(() => storedText(page, b.id)).toBe('[ACTORS]\nTwo\n\nOne');
    await expect(card(page, added.id)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(3);
    await undo(page);
    await expect(card(page, added.id)).toBeVisible();
    await expect.poll(() => storedText(page, b.id)).toBe('[ACTORS]\nTwo');
    await drag(page, await center(badge(page, added.id, 'ACTORS')), await center(badge(page, b.id, 'ACTORS')), true);
    await expect.poll(() => storedText(page, b.id)).toBe('[ACTORS]\nTwo\n\nOne');
    expect(await storedText(page, added.id)).toContain('One');
    await page.reload();
    await expect(cards(page)).toHaveCount(4);
    await expect(page.locator('[data-text-bubble]')).toHaveCount(0);
    await expect.poll(() => storedText(page, b.id)).toBe('[ACTORS]\nTwo\n\nOne');
    await page.screenshot({ path: info.outputPath('prompt-after-drop.png') });
  } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
});

test('native selection, textarea, exact repeated section, Escape and ordinary header dragging', async ({ page, context, baseURL }) => {
  const { a, b, extract, owner } = await setup(page, context, baseURL);
  try {
    const editor = card(page, a.id).locator('.text-prompt-variable-content');
    await drag(page, await selectedPoint(editor, 6, 14), empty);
    await expect(cards(page)).toHaveCount(4);
    await expect.poll(() => storedText(page, a.id)).toBe('First  last\n\n[ACTORS]\nOne\n\n[STYLE]\nBlue');
    await undo(page);
    await drag(page, await selectedPoint(editor, 6, 14), empty, true);
    await expect(cards(page)).toHaveCount(4);
    await expect.poll(() => storedText(page, a.id)).toContain('First fragment last');
    await undo(page);
    const textarea = card(page, extract.id).locator('textarea[data-text-field="prompt"]');
    const point = await textarea.evaluate((element) => {
      const input = element as HTMLTextAreaElement; input.focus(); input.setSelectionRange(0, 7);
      const rect = input.getBoundingClientRect(); return { x: rect.x + 25, y: rect.y + 18 };
    });
    await drag(page, point, empty);
    await expect.poll(() => storedText(page, extract.id, 'prompt')).toBe('');
    await undo(page);
    await drag(page, await center(badge(page, b.id, 'ACTORS')), await center(textarea));
    await expect.poll(() => storedText(page, extract.id, 'prompt')).toBe('Analyze\n\n[ACTORS]\nTwo');
    await expect(card(page, b.id)).toHaveCount(0);
    await undo(page);
    await expect(card(page, b.id)).toBeVisible();
    const result = card(page, extract.id).locator('.text-section-result-editor');
    const second = result.locator('p').last();
    await drag(page, await selectedPoint(second, '[STYLE]\n'.length, '[STYLE]\nRepeated words.'.length), empty);
    await expect.poll(() => storedText(page, extract.id, 'result')).toContain('[ACTORS]\nRepeated words.');
    await expect.poll(() => storedText(page, extract.id, 'result')).not.toContain('[STYLE]\nRepeated words.');
    await undo(page);
    const before = await snapshot(page);
    const chip = badge(page, a.id, 'STYLE');
    await drag(page, await center(chip), empty, false, async () => {
      await expect(page.locator('.text-fragment-drag-preview')).toBeVisible();
      await page.keyboard.press('Escape');
    });
    await expect(page.locator('.text-fragment-drag-preview')).toHaveCount(0);
    expect((await snapshot(page)).nodes).toEqual(before.nodes);
    const start = await center(card(page, b.id).locator('.node-title').first());
    await drag(page, start, { x: start.x + 40, y: start.y + 50 });
    await expect(cards(page)).toHaveCount(3);
    await expect.poll(async () => (await snapshot(page)).nodes.find((n: ProductionNode) => n.id === b.id).position).not.toEqual(before.nodes[1].position);
  } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
});

for (const type of ['textConcat', 'generateImage', 'textFormatter'] as const) {
  test(`badge drop into ${type} uses its real text editor and one undo`, async ({ page, context, baseURL }) => {
    const from = createDefaultNode('textPrompt', { x: 0, y: 0 });
    from.id = 'source'; from.data = { ...from.data, text: '[CAMERA]\nPortrait' };
    const target = createDefaultNode(type, { x: 480, y: 0 }); target.id = 'target';
    const field = type === 'textConcat' ? 'suffix' : type === 'textFormatter' ? 'plainText' : 'prompt';
    const rich = createTelegramEditorValueFromSegments('Original', [{ text: 'Original', formats: ['bold'] }]);
    target.data = { ...target.data, [field]: 'Original', ...(type === 'textFormatter' ? { ...rich, result: rich.plainText } : {}) };
    const { owner } = await setup(page, context, baseURL, [from, target]);
    try {
      const targetField = card(page, target.id).locator(`[data-text-field="${field}"]:not([data-text-fragment-handle])`).first();
      await drag(page, await center(badge(page, from.id, 'CAMERA')), await center(targetField));
      await expect.poll(() => storedText(page, target.id, field)).toBe('Original\n\n[CAMERA]\nPortrait');
      await expect(card(page, from.id)).toHaveCount(0);
      if (type === 'textFormatter') {
        const data = (await snapshot(page)).nodes.find((node: ProductionNode) => node.id === target.id)!.data;
        expect(JSON.parse(data.richText).root.children[0]).toEqual(JSON.parse(rich.richText).root.children[0]);
      }
      await undo(page);
      await expect.poll(() => storedText(page, target.id, field)).toBe('Original');
      await expect.poll(() => storedText(page, from.id)).toBe('[CAMERA]\nPortrait');
    } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
  });
}
