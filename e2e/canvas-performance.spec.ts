import { gotoQaSection } from './release-user-fixture';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import { awaitQaAssetIngest, audioQaForm, createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1600, height: 1100 } });

test('canvas drag/arrow stay transient; thumbnails use small assets; Back drains saves and creates a background overview', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Canvas QA is local-only.');
  const owner = await createAudioQaOwner(origin.origin, 'canvas-performance');
  await context.addCookies(owner.http.browserSessionCookies());
  await page.addInitScript(() => {
    const counters = { graphWrites: 0 };
    Object.assign(window, { canvasQa: counters });
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('reverie-image-production-project:')) counters.graphWrites++;
      return setItem.call(this, key, value);
    };
  });
  const document = (await (await owner.http.request('/api/projects', { json: {
    workspaceId: owner.workspaceId, name: 'QA Canvas performance',
  } })).json()).project;
  const bytes = await sharp({ create: { width: 3200, height: 1800, channels: 3, background: '#3388bb' } }).png().toBuffer();
  const { asset } = await awaitQaAssetIngest(owner.http, await owner.http.request('/api/assets/images', { form: audioQaForm(bytes, owner.workspaceId, true) }));
  const input = createDefaultNode('importImage', { x: 0, y: 0 });
  input.data = { ...input.data, assetId: asset.id };
  const prompt = createDefaultNode('textPrompt', { x: 470, y: 0 });
  prompt.data = { ...prompt.data, text: 'QA initial text' };
  const target = createDefaultNode('generateImage', { x: 930, y: 0 });
  const nodes = [input, prompt, target];
  const ui = createEmptyProjectUiState();
  const seed = createProjectExport({ ...structuredClone(initialProject), nodes, edges: [{
    id: 'qa-reference', sourceNodeId: input.id, sourcePortId: 'image', targetNodeId: target.id, targetPortId: 'reference',
  }], assets: [{ id: asset.id, kind: 'image', name: 'large-qa.png', mimeType: 'image/png', width: 3200, height: 1800,
    createdAt: asset.createdAt, storage: { type: 'remote', assetId: asset.id } }] }, ui);
  expect((await owner.http.request(`/api/projects/${document.id}`, { method: 'PATCH', json: { expectedRevision: document.revision, snapshot: seed } })).status).toBe(200);
  const readProject = async () => (await (await owner.http.request(`/api/projects/${document.id}`)).json()).project;
  const writes = () => page.evaluate(() => (window as unknown as { canvasQa: { graphWrites: number } }).canvasQa.graphWrites);
  const readLocal = () => page.evaluate(() => JSON.parse(localStorage.getItem('reverie-image-production-project:v1')!).state);
  let thumbnailUploads = 0;
  let generationCalls = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/projects/${document.id}/thumbnail`)) thumbnailUploads++;
  });
  await page.route('**/api/ai/generate-image', async (route) => {
    generationCalls++;
    // Hold the loader without starting a paid backend job.
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.fulfill({ status: 400, json: { error: { message: 'Synthetic QA response' } } });
  });
  const card = page.locator(`[data-node-id="${prompt.id}"]`);
  const inputCard = page.locator(`[data-node-id="${input.id}"]`);
  const targetCard = page.locator(`[data-node-id="${target.id}"]`);
  try {
    await gotoQaSection(page, `/projects/${document.id}`);
    await expect(card).toBeVisible();
    await expect(inputCard.locator('img').first()).toHaveAttribute('src', /variant=thumbnail/);
    await expect.poll(() => inputCard.locator('img').first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(560);
    await inputCard.locator('.image-plate').click();
    await expect(page.locator('.image-viewer-overlay')).toBeVisible();
    await expect(page.locator('.image-viewer-overlay img').filter({ visible: true }).first()).toHaveAttribute('src', new RegExp(`/api/assets/${asset.id}/content$`));
    await page.keyboard.press('Escape');
    await expect(page.locator('.image-viewer-overlay')).toHaveCount(0);
    await page.waitForTimeout(1_200);
    const before = await readLocal();
    await card.locator('.node-title').first().click();
    await targetCard.locator('textarea.prompt-box').fill('Synthetic QA loader test');
    await targetCard.getByRole('button', { name: 'Generate', exact: true }).click();
    const rect = (await card.boundingBox())!;
    await page.mouse.move(rect.x + 80, rect.y + 22);
    await page.mouse.down();
    await page.waitForTimeout(150);
    const writeStart = await writes();
    await page.mouse.move(rect.x + 140, rect.y + 72, { steps: 40 });
    await expect(card).toHaveAttribute('style', /transform: translate/);
    await page.waitForTimeout(500);
    expect(await writes()).toBe(writeStart);
    expect((await readLocal()).nodes.find((node: { id: string }) => node.id === prompt.id).position).toEqual(before.nodes.find((node: { id: string }) => node.id === prompt.id).position);
    await page.mouse.up();
    await expect(card).not.toHaveAttribute('style', /transform: translate/);
    const moved = await readLocal();
    expect(moved.nodes.map((node: { id: string }) => node.id)).toEqual(before.nodes.map((node: { id: string }) => node.id));
    expect(moved.edges).toEqual(before.edges);
    expect(moved.nodes[0]).toEqual(before.nodes[0]);
    expect(moved.nodes[1].data).toEqual(before.nodes[1].data);
    expect(moved.nodes[1].position).not.toEqual(before.nodes[1].position);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await readLocal()).nodes[1].position).toEqual(before.nodes[1].position);
    // Escape discards preview coordinates and leaves topology untouched.
    const resetRect = (await card.boundingBox())!;
    await page.mouse.move(resetRect.x + 80, resetRect.y + 22); await page.mouse.down();
    await page.mouse.move(resetRect.x + 130, resetRect.y + 40, { steps: 10 });
    await page.keyboard.press('Escape'); await page.mouse.up();
    expect((await readLocal()).nodes[1].position).toEqual(before.nodes[1].position);
    const port = card.locator('[data-port-side="output"]').first();
    const portRect = (await port.boundingBox())!;
    await page.mouse.move(portRect.x + portRect.width / 2, portRect.y + portRect.height / 2);
    await page.mouse.down(); await page.waitForTimeout(150);
    const arrowWrites = await writes();
    await page.mouse.move(portRect.x + 160, portRect.y + 110, { steps: 35 });
    expect(await writes()).toBe(arrowWrites);
    await page.keyboard.press('Escape'); await page.mouse.up();
    expect((await readLocal()).edges).toEqual(before.edges);
    await page.waitForTimeout(4_000);
    expect(thumbnailUploads).toBe(0);

    // Delay an autosave, edit again, and navigate immediately. The second save
    // must use the first request's acknowledged revision after editor unmount.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let held = false;
    await page.route(`**/api/projects/${document.id}`, async (route) => {
      if (route.request().method() === 'PATCH' && !held) { held = true; await gate; }
      await route.continue();
    });
    await card.getByRole('textbox', { name: 'Write prompt. Type @ to insert a variable.' }).fill('QA first delayed save');
    await expect.poll(() => held).toBe(true);
    await card.getByRole('textbox', { name: 'Write prompt. Type @ to insert a variable.' }).fill('QA final text before Back');
    const start = Date.now();
    await page.getByRole('link', { name: 'Back to Flows', exact: true }).click();
    await expect(page).toHaveURL(/\/flows$/);
    expect(Date.now() - start).toBeLessThan(2_000);
    release();
    await expect.poll(async () => (await readProject()).snapshot.project.nodes.find((node: { id: string }) => node.id === prompt.id).data.text).toBe('QA final text before Back');
    await expect.poll(() => thumbnailUploads).toBe(1);
    await expect.poll(async () => (await readProject()).thumbnailAvailable).toBe(true);
    await expect(page.locator(`img[src*="/api/assets/"]`).first()).toBeVisible();
    expect(generationCalls).toBe(1);

    // A late automatic overview cannot replace a manually chosen thumbnail.
    const current = await readProject();
    const upload = (mode: string, revision: number) => {
      const form = new FormData(); form.set('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'qa.png');
      form.set('mode', mode); form.set('expectedRevision', String(revision));
      return owner.http.request(`/api/projects/${document.id}/thumbnail`, { form });
    };
    expect((await upload('auto', current.revision - 1)).status).toBe(200);
    expect((await readProject()).thumbnailUrl).toBe(current.thumbnailUrl);
    expect((await upload('manual', current.revision)).status).toBe(201);
    const manual = await readProject();
    expect((await upload('auto', current.revision)).status).toBe(200);
    expect((await readProject()).thumbnailUrl).toBe(manual.thumbnailUrl);
  } finally {
    await owner.http.request(`/api/projects/${document.id}`, { method: 'PATCH', json: { status: 'trash' } });
    await owner.http.request(`/api/projects/${document.id}`, { method: 'DELETE' });
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});
