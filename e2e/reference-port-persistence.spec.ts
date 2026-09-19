import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import type { AssetRecord, GenerateImageNodeData } from '../src/entities/production-graph/model/types';
import { audioQaForm, createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1500, height: 1550 } });

test('three general references survive editing, section collapse, autosave and two browser reloads', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Reference QA is local-only.');
  const owner = await createAudioQaOwner(origin.origin, 'reference-port');
  await context.addCookies(owner.http.browserSessionCookies());
  const created = await owner.http.request('/api/projects', { json: { workspaceId: owner.workspaceId, name: 'QA Reference persistence' } });
  expect(created.status).toBe(201);
  const document = (await created.json()).project;
  const imports = [];
  const assets: AssetRecord[] = [];
  for (const [index, colour] of ['red', 'green', 'blue'].entries()) {
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: colour } }).png().toBuffer();
    const response = await owner.http.request('/api/assets/images', { form: audioQaForm(bytes, owner.workspaceId, true) });
    expect(response.status).toBe(201);
    const asset = (await response.json()).asset;
    const node = createDefaultNode('importImage', { x: 20 + index * 360, y: 20 });
    node.data = { ...node.data, title: `Reference ${index + 1}`, assetId: asset.id };
    imports.push(node);
    assets.push({ id: asset.id, kind: 'image', name: `Reference ${index + 1}.png`, mimeType: 'image/png', width: 32, height: 32,
      createdAt: asset.createdAt, storage: { type: 'remote', assetId: asset.id } });
  }
  const generate = createDefaultNode('generateImage', { x: 800, y: 480 });
  const style = createDefaultNode('textPrompt', { x: 360, y: 600 });
  style.data = { ...style.data, text: 'A deliberately separate style instruction.' };
  const edges = [...imports.map((node, index) => ({ id: `reference-${index}`, sourceNodeId: node.id, sourcePortId: 'image', targetNodeId: generate.id, targetPortId: 'reference' })),
    { id: 'style-text', sourceNodeId: style.id, sourcePortId: 'text', targetNodeId: generate.id, targetPortId: 'style' }];
  const ui = createEmptyProjectUiState(); ui.viewport = { x: 30, y: 20, zoom: 0.75 };
  const seed = createProjectExport({ ...structuredClone(initialProject), nodes: [...imports, generate, style], edges, assets }, ui);
  expect((await owner.http.request(`/api/projects/${document.id}`, { method: 'PATCH', json: { expectedRevision: document.revision, snapshot: seed } })).status).toBe(200);
  let paidCalls = 0;
  await page.route('**/api/ai/generate-image', route => { paidCalls++; return route.abort('blockedbyclient'); });
  const card = page.locator(`[data-node-id="${generate.id}"]`);
  const reference = card.locator('button.node-port[data-port-id="reference"]');
  const styleRow = card.locator('.composing-row[data-port-id="style"]');
  const saved = async () => (await (await owner.http.request(`/api/projects/${document.id}`)).json()).project.snapshot;
  try {
    await page.goto(`/projects/${document.id}`);
    for (let cycle = 1; cycle <= 2; cycle++) {
      await expect(reference).toHaveClass(/node-port-connected/);
      const toggle = card.getByRole('button', { name: 'Prompt', exact: true });
      if (!(await styleRow.isVisible())) await toggle.click();
      await expect(styleRow.locator('.input-pill')).toHaveText('Text · 1');
      await toggle.click();
      await expect(reference).toHaveClass(/node-port-connected/);
      await toggle.click();
      const prompt = `Persistence check ${cycle}`;
      await card.locator('textarea.prompt-box').fill(prompt);
      await expect.poll(async () => ((await saved()).project.nodes.find((node: { id: string }) => node.id === generate.id).data as GenerateImageNodeData).prompt).toBe(prompt);
      expect((await saved()).project.edges).toEqual(edges);
      await page.reload();
      await expect(reference).toHaveClass(/node-port-connected/);
    }
    expect((await saved()).project.edges).toEqual(edges);
    expect(paidCalls).toBe(0);
  } finally {
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});
