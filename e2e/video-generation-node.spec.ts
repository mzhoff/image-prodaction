import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import type { GenerateVideoNodeData } from '../src/entities/production-graph/model/types';
import type { VideoModelCapabilities } from '../src/shared/media/video-generation-contracts';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL, trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1250 } });

test('video modes expose only relevant ports, submit one durable job, resume with Lottie and play saved versions', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'video-generation-node');
  await context.addCookies(owner.http.browserSessionCookies());
  const liveCatalog = await owner.http.request('/api/ai/video-models');
  expect(liveCatalog.status).toBe(200);
  const liveModels = (await liveCatalog.json()).models as VideoModelCapabilities[];
  expect(liveModels.some((item) => item.key === 'google/veo-3.1-lite')).toBe(true);
  expect((await owner.http.request('/api/ai/generate-video', { json: {} })).status).toBe(400);
  expect((await fetch(`${origin.origin}/api/ai/generate-video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);
  const videoBytes = execFileSync('docker', ['exec', 'image-prodaction-web-1', 'ffmpeg', '-nostdin', '-v', 'error',
    '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:r=10:d=1', '-threads', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'], { timeout: 15_000, maxBuffer: 1024 * 1024 });
  const sourceIds = [randomUUID(), randomUUID()];
  const previousId = randomUUID(), resultId = randomUUID(), jobId = randomUUID();
  const sources = sourceIds.map((assetId, i) => {
    const node = createDefaultNode('importImage', { x: 30, y: 70 + i * 320 });
    return { ...node, data: { ...node.data, assetId } };
  });
  const video = createDefaultNode('generateVideo', { x: 500, y: 40 });
  const emptyVideo = createDefaultNode('generateVideo', { x: 1000, y: 40 });
  const image = createDefaultNode('generateImage', { x: 1480, y: 40 });
  video.data = { ...video.data, mode: 'frames', prompt: 'A blue sphere turns slowly. Camera stays still.', resultAssetIds: [previousId] } as GenerateVideoNodeData;
  emptyVideo.status = 'error';
  emptyVideo.data = { ...emptyVideo.data, mode: 'frames', message: 'OpenRouter Video: HTTP 400: {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"Input image may contain real person."}}' } as GenerateVideoNodeData;
  const metadata = { container: 'mp4' as const, codec: 'h264' as const, contentType: 'video/mp4' as const,
    durationSeconds: 1, width: 160, height: 120, frameRate: 10, rotationDegrees: 0, audioTracks: [], browserPlayable: true };
  const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [...sources, video, emptyVideo, image],
    edges: sources.map((source, i) => ({ id: randomUUID(), sourceNodeId: source.id, sourcePortId: 'image', targetNodeId: video.id, targetPortId: i ? 'last-frame' : 'first-frame' })),
    assets: [...sourceIds.map((id, i) => ({ id, kind: 'image' as const, name: `Frame ${i + 1}`, mimeType: 'image/png', width: 1, height: 1,
      createdAt: new Date().toISOString(), storage: { type: 'remote' as const, assetId: id } })),
    { id: previousId, kind: 'video', name: 'Previous clip', mimeType: 'video/mp4', width: 160, height: 120, video: metadata,
      createdAt: new Date().toISOString(), storage: { type: 'remote', assetId: previousId } }],
  }, createEmptyProjectUiState());
  // No user documents or provider credentials: document/autosaves/job are test-local route fixtures.
  const document = { id: randomUUID(), name: 'QA Generate Video', workspaceId: owner.workspaceId, revision: 1,
    schemaVersion: snapshot.schemaVersion, snapshot, favorite: false, hasEverHadContent: true,
    status: 'active', thumbnailAvailable: false, thumbnailMode: 'auto', thumbnailUrl: '' };
  const models: VideoModelCapabilities[] = [
    { key: 'google/veo-3.1-lite', label: 'Veo 3.1 Lite', description: 'QA catalog', route: { gateway: 'openrouter', modelId: 'google/veo-3.1-lite' },
      durations: [4, 6, 8], resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16'], firstFrame: true, lastFrame: true, references: false, audio: true, seed: true },
    { key: 'kwaivgi/kling-3.0-standard', label: 'Kling 3.0 Standard', description: 'QA catalog', route: { gateway: 'openrouter', modelId: 'kwaivgi/kling-3.0-standard' },
      durations: [3, 5, 10], resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'], firstFrame: true, lastFrame: true, references: false, audio: true, seed: false },
  ];
  let complete = false, submitted = 0, unexpectedPaidCalls = 0;
  await page.route('**/api/ai/**', async (route) => {
    if (route.request().url().endsWith('/video-models')) return route.fulfill({ json: { models } });
    if (route.request().url().endsWith('/generate-video')) {
      submitted++;
      expect(route.request().postDataJSON()).toMatchObject({ workspaceId: owner.workspaceId, documentId: document.id,
        request: { model: models[1].key, mode: 'frames', duration: 3,
          firstFrame: { assetId: sourceIds[0] }, lastFrame: { assetId: sourceIds[1] }, references: [] } });
      expect(route.request().postDataJSON().request).not.toHaveProperty('seed');
      return route.fulfill({ status: 202, json: { job: { id: jobId, status: 'queued' } } });
    }
    if (route.request().method() === 'GET') return route.continue();
    unexpectedPaidCalls++; return route.abort();
  });
  await page.route(`**/api/generation-jobs/${jobId}`, (route) => route.fulfill({ json: complete
    ? { job: { id: jobId, status: 'succeeded' }, asset: { id: resultId, originalName: 'Generated QA clip', contentType: 'video/mp4', createdAt: new Date().toISOString(), video: metadata } }
    : { job: { id: jobId, status: 'running' } } }));
  await page.route('**/api/assets/**', (route) => {
    const isVideo = [previousId, resultId].some((id) => route.request().url().includes(id));
    return route.fulfill({ contentType: isVideo ? 'video/mp4' : 'image/png', body: isVideo ? videoBytes
      : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YGbCLcAAAAASUVORK5CYII=', 'base64') });
  });
  await page.route(`**/api/projects/${document.id}/thumbnail`, (route) => route.fulfill({ json: { project: document } }));
  await page.route(`**/api/projects/${document.id}`, async (route) => {
    if (route.request().method() === 'PATCH') { document.snapshot = route.request().postDataJSON().snapshot; document.revision++; }
    await route.fulfill({ json: { project: document } });
  });
  try {
    await page.goto(`/projects/${document.id}`);
    const node = page.locator(`[data-node-id="${video.id}"]`);
    const empty = page.locator(`[data-node-id="${emptyVideo.id}"]`);
    const imageNode = page.locator(`[data-node-id="${image.id}"]`);
    await expect(empty.getByRole('img', { name: 'Место для будущего видео' })).toBeVisible();
    await expect(empty.getByRole('button', { name: 'Generate video', exact: true })).toBeDisabled();
    await expect(empty.getByRole('alert')).toHaveText('Модель отклонила кадр: в нём распознан реальный человек. Для этого изображения выберите другую модель или используйте кадр без людей.');
    await expect(empty.getByRole('alert')).not.toContainText(/HTTP|OpenRouter|400/i);
    await expect(empty.locator('.video-generation-hint')).toHaveCount(0);
    const disconnectedBadge = empty.locator('.input-pill-disconnected').first();
    await expect(disconnectedBadge).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await disconnectedBadge.hover();
    await expect(disconnectedBadge).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await empty.screenshot({ path: '/tmp/image-production-video-placeholder.png' });
    const imageAspectRow = imageNode.locator('.setting-row').filter({ hasText: 'Aspect Ratio' });
    await imageAspectRow.getByRole('button').click();
    await expect(page.getByRole('dialog', { name: 'Выбор соотношения сторон' })).toBeVisible();
    await page.locator('[data-aspect-ratio="16:9"]').click();
    await expect(imageAspectRow.getByRole('button')).toContainText('16:9');
    await expect(node.getByRole('button', { name: 'Generate video', exact: true })).toBeEnabled();
    await expect(node.locator('.image-plate')).toHaveCSS('aspect-ratio', '16 / 9');
    const row = (label: string) => node.locator('.setting-row').filter({ has: page.locator(`span:text-is("${label}")`) }).getByRole('button');
    await row('Mode').click(); await page.getByRole('option', { name: 'Только текст', exact: true }).click();
    await expect(node.locator('button.node-port[data-port-id="first-frame"]')).toHaveCount(0);
    await expect(node.locator('button.node-port[data-port-id="reference-1"]')).toHaveCount(0);
    await expect(node.getByRole('button', { name: 'Generate video', exact: true })).toBeEnabled();
    await row('Mode').click(); await page.getByRole('option', { name: 'Первый / последний кадр', exact: true }).click();
    await node.getByRole('spinbutton', { name: 'Video seed' }).fill('42');
    await row('Model').click(); await page.getByRole('button', { name: 'Kling 3.0 Standard', exact: true }).click();
    await expect(node.getByRole('spinbutton', { name: 'Video seed' })).toHaveCount(0);
    await expect(row('Duration')).toContainText('3 s');
    for (const port of ['first-frame', 'last-frame']) await expect(node.locator(`button.node-port[data-port-id="${port}"]`)).toHaveClass(/node-port-connected/);
    const readyImageBadge = node.locator('.input-pill-ready.input-pill-data-image').first();
    await expect(readyImageBadge).toBeVisible();
    await expect(readyImageBadge).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await node.getByRole('button', { name: 'Generate video', exact: true }).click();
    await expect.poll(() => (document.snapshot.project.nodes.find((item) => item.id === video.id)?.data as GenerateVideoNodeData).videoRequest?.jobId).toBe(jobId);
    await expect(node.getByRole('textbox', { name: 'Video prompt' })).toBeDisabled();
    await page.reload();
    await expect(node.locator('.video-generation-job')).toHaveCount(0);
    await expect(node.getByRole('button', { name: 'Generate video', exact: true })).toBeDisabled();
    await expect(node.getByRole('button', { name: 'Отменить ожидание', exact: true })).toBeVisible();
    await expect(node.locator('.generation-waiting-experience')).toBeVisible();
    expect(submitted).toBe(1);
    complete = true;
    const player = node.locator('video.video-generation-preview');
    await expect(player).toHaveAttribute('src', new RegExp(resultId));
    await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
    await expect(node.getByText('2/2', { exact: true })).toBeVisible();
    await node.locator('.image-plate').hover();
    await expect(node.getByRole('button', { name: 'Video is saved in Library' })).toBeVisible();
    await expect(node.getByRole('button', { name: 'Download video' })).toBeVisible();
    await expect(node.getByRole('button', { name: 'Open video' })).toBeVisible();
    await node.getByRole('button', { name: 'Previous video' }).click();
    await expect(player).toHaveAttribute('src', new RegExp(previousId));
    await node.getByRole('button', { name: 'Next video' }).click();
    await node.getByRole('button', { name: 'Open video' }).click();
    await expect(page.getByRole('dialog', { name: 'Image viewer' })).toBeVisible();
    await expect(page.locator('video.image-viewer-media')).toHaveAttribute('src', new RegExp(resultId));
    await page.getByRole('button', { name: 'Close image viewer' }).click();
    // Tall result cards need enough viewport height for an unclipped visual artifact.
    await page.setViewportSize({ width: 1440, height: 2000 });
    await page.getByRole('button', { name: 'Zoom to fit', exact: true }).click();
    const frameRow = node.locator('.video-generation-input').first();
    const inputBox = (await frameRow.locator('.node-port').boundingBox())!;
    const labelBox = (await frameRow.locator(':scope > span:not(.input-pill)').boundingBox())!;
    expect(inputBox.x + inputBox.width).toBeLessThan(labelBox.x);
    const nodeBox = (await node.boundingBox())!, playerBox = (await player.boundingBox())!;
    expect(Math.abs(inputBox.x + inputBox.width / 2 - nodeBox.x)).toBeLessThanOrEqual(2);
    expect(playerBox.x).toBeGreaterThan(nodeBox.x + 5);
    expect(playerBox.x + playerBox.width).toBeLessThan(nodeBox.x + nodeBox.width - 5);
    const promptPortBox = (await node.locator('button.node-port[data-port-id="prompt"]').boundingBox())!;
    const promptTitleBox = (await node.locator('.node-section-title-drop-target strong').boundingBox())!;
    expect(promptTitleBox.x).toBeGreaterThan(promptPortBox.x + promptPortBox.width);
    const portErrors = await page.locator('article.production-node').evaluateAll((cards) => cards.flatMap((card) => {
      const cardBox = card.getBoundingClientRect();
      return Array.from(card.querySelectorAll<HTMLButtonElement>('button.node-port')).map((port) => {
        const portBox = port.getBoundingClientRect();
        const center = (portBox.left + portBox.right) / 2;
        const edge = port.classList.contains('node-port-input') ? cardBox.left : cardBox.right;
        return Math.abs(center - edge);
      });
    }));
    expect(Math.max(...portErrors)).toBeLessThanOrEqual(1.5);
    await node.screenshot({ path: '/tmp/image-production-video-node.png' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(node.getByRole('button', { name: 'Generate video', exact: true })).toBeEnabled();
    await node.screenshot({ path: '/tmp/image-production-video-node-dark.png' });
    expect(submitted).toBe(1); expect(unexpectedPaidCalls).toBe(0);
  } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
});
