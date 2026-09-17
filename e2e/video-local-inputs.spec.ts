import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import type { CropImageNodeData, ExportImageNodeData, GenerateVideoNodeData } from '../src/entities/production-graph/model/types';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1800, height: 1200 } });
for (const mode of ['frames', 'references'] as const) test(`local Crop and Export outputs prepare exact ${mode} before one durable submit`, async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, `video-local-${mode}`);
  await context.addCookies(owner.http.browserSessionCookies());
  const sourceId = randomUUID(), jobId = randomUUID();
  const png = await sharp({ create: { width: 80, height: 120, channels: 3, background: '#247bbb' } }).png().toBuffer();
  const image = createDefaultNode('importImage', { x: 0, y: 40 }); image.data = { ...image.data, assetId: sourceId };
  const crop = createDefaultNode('cropImage', { x: 420, y: 40 });
  crop.data = { ...crop.data, cropStateVersion: 3, aspectRatio: 'Custom', sourceAssetId: sourceId, sourceAspectRatio: 80 / 120,
    crop: { x: 0, y: 0, width: 0.5, height: 1 } } as CropImageNodeData;
  const exported = createDefaultNode('exportImage', { x: 840, y: 40 });
  exported.data = { ...exported.data, format: 'jpeg', quality: '90', scale: '0.5', background: 'white' } as ExportImageNodeData;
  const video = createDefaultNode('generateVideo', { x: 1260, y: 40 });
  video.data = { ...video.data, mode, prompt: 'A static blue panel moves slowly.', referenceDescriptions: ['crop', 'export', 'same crop'] } as GenerateVideoNodeData;
  const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => ({ id: randomUUID(), sourceNodeId, sourcePortId, targetNodeId, targetPortId });
  const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [image, crop, exported, video],
    edges: [edge(image.id, 'image', crop.id, 'image'), edge(crop.id, 'result', exported.id, 'image-0'),
      edge(crop.id, 'result', video.id, mode === 'frames' ? 'first-frame' : 'reference-1'),
      edge(exported.id, 'image', video.id, mode === 'frames' ? 'last-frame' : 'reference-2'),
      ...(mode === 'references' ? [edge(crop.id, 'result', video.id, 'reference-3')] : [])],
    assets: [{ id: sourceId, kind: 'image', name: 'source.png', mimeType: 'image/png', width: 80, height: 120,
      createdAt: new Date().toISOString(), storage: { type: 'remote', assetId: sourceId } }],
  }, createEmptyProjectUiState());
  const document = { id: randomUUID(), name: 'QA local video inputs', workspaceId: owner.workspaceId, revision: 1,
    schemaVersion: snapshot.schemaVersion, snapshot, favorite: false, hasEverHadContent: true,
    status: 'active', thumbnailAvailable: false, thumbnailMode: 'auto', thumbnailUrl: '' };
  const uploaded: Array<{ id: string; width: number; height: number; format: string }> = [];
  let submitCount = 0, otherPaidCalls = 0;
  let releaseUploads!: () => void;
  const uploadsGate = new Promise<void>((resolve) => { releaseUploads = resolve; });
  await page.route('**/api/assets/**', async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ contentType: 'image/png', body: png });
    expect(new URL(route.request().url()).pathname).toBe('/api/assets/images');
    const form = await new Response(new Uint8Array(route.request().postDataBuffer()!), { headers: { 'content-type': route.request().headers()['content-type'] } }).formData();
    expect(form.get('workspaceId')).toBe(owner.workspaceId); expect(form.get('documentId')).toBe(document.id);
    const file = form.get('file') as File;
    const metadata = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    const item = { id: randomUUID(), width: metadata.width!, height: metadata.height!, format: metadata.format! };
    uploaded.push(item);
    await uploadsGate;
    return route.fulfill({ json: { asset: { ...item, contentType: file.type, originalName: file.name, createdAt: new Date().toISOString() } } });
  });
  await page.route('**/api/ai/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/video-models')) return route.fulfill({ json: { models: [{ key: 'google/veo-3.1-lite', label: 'Veo 3.1 Lite', description: 'QA fixture',
      route: { gateway: 'openrouter', modelId: 'google/veo-3.1-lite' }, durations: [4], resolutions: ['720p'], aspectRatios: ['16:9'], firstFrame: true, lastFrame: true, references: true, audio: true, seed: true }] } });
    if (path.endsWith('/generate-video')) {
      submitCount++;
      const payload = route.request().postDataJSON().request;
      const cropFile = uploaded.find((item) => item.format === 'png')!, exportFile = uploaded.find((item) => item.format === 'jpeg')!;
      expect([cropFile.width, cropFile.height]).toEqual([40, 120]); expect([exportFile.width, exportFile.height]).toEqual([20, 60]);
      if (mode === 'frames') {
        expect(payload.firstFrame.assetId).toBe(cropFile.id); expect(payload.lastFrame.assetId).toBe(exportFile.id);
      } else expect(payload.references).toEqual([
        { slot: 1, assetId: cropFile.id, description: 'crop' }, { slot: 2, assetId: exportFile.id, description: 'export' }, { slot: 3, assetId: cropFile.id, description: 'same crop' },
      ]);
      return route.fulfill({ status: 202, json: { job: { id: jobId, status: 'queued' } } });
    }
    if (route.request().method() === 'GET') return route.continue();
    otherPaidCalls++; return route.abort();
  });
  await page.route(`**/api/generation-jobs/${jobId}`, (route) => route.fulfill({ json: { job: { id: jobId, status: 'running' } } }));
  await page.route(`**/api/projects/${document.id}/thumbnail`, (route) => route.fulfill({ json: { project: document } }));
  await page.route(`**/api/projects/${document.id}`, async (route) => {
    if (route.request().method() === 'PATCH') { document.snapshot = route.request().postDataJSON().snapshot; document.revision++; }
    await route.fulfill({ json: { project: document } });
  });
  try {
    await page.goto(`/projects/${document.id}`);
    const node = page.locator(`[data-node-id="${video.id}"]`), generate = node.getByRole('button', { name: 'Generate video', exact: true });
    await expect(generate).toBeEnabled();
    expect(uploaded).toHaveLength(0); expect(submitCount).toBe(0);
    await node.screenshot({ path: `/tmp/ip-video-local-${mode}.png` });
    // Exercise the synchronous guard too: repeated clicks during preparation
    // must not create a second upload set or paid request.
    await generate.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect.poll(() => uploaded.length).toBe(2);
    await expect(generate).toBeDisabled(); expect(submitCount).toBe(0);
    releaseUploads();
    await expect.poll(() => submitCount).toBe(1);
    await expect.poll(() => (document.snapshot.project.nodes.find((item) => item.id === video.id)?.data as GenerateVideoNodeData).videoRequest?.jobId).toBe(jobId);
    await page.reload();
    await expect(generate).toBeDisabled();
    await expect(node.getByRole('button', { name: 'Отменить ожидание', exact: true })).toBeVisible();
    expect(submitCount).toBe(1); expect(uploaded).toHaveLength(2); expect(otherPaidCalls).toBe(0);
  } finally { releaseUploads(); await owner.http.request('/api/auth/sign-out', { json: {} }); }
});
