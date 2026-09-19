import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import { getGeneratePromptSectionPortId } from '../src/entities/production-graph/model/generate-image-prompt-sections';
import type { AssetRecord } from '../src/entities/production-graph/model/types';
import { audioQaForm, createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'only-on-failure', viewport: { width: 1500, height: 1250 } });
test('image sections detach Prompt; scissors and reference badges disconnect with undo and persistence', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'generate-prompt-sections');
  await context.addCookies(owner.http.browserSessionCookies());
  const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#3498db' } }).png().toBuffer();
  const uploaded = await owner.http.request('/api/assets/images', { form: audioQaForm(bytes, owner.workspaceId, true) });
  expect(uploaded.status).toBe(201);
  const asset = (await uploaded.json()).asset;
  const source = createDefaultNode('textPrompt', { x: 30, y: 20 });
  source.data = { ...source.data, text: 'A plain prompt', title: 'Описание сцены' };
  const reference = createDefaultNode('importImage', { x: 30, y: 380 });
  reference.data = { ...reference.data, assetId: asset.id, title: 'Мой герой' };
  const image = createDefaultNode('generateImage', { x: 460, y: 20 });
  const subject = createDefaultNode('subjectBuilder', { x: 1300, y: 20 });
  const video = createDefaultNode('generateVideo', { x: 900, y: 20 });
  video.data = { ...video.data, mode: 'references' };
  const edges = [
    { id: 'prompt-link', sourceNodeId: source.id, sourcePortId: 'text', targetNodeId: image.id, targetPortId: 'prompt' },
    { id: 'subject-reference', sourceNodeId: reference.id, sourcePortId: 'image', targetNodeId: subject.id, targetPortId: 'image' },
    { id: 'image-reference', sourceNodeId: reference.id, sourcePortId: 'image', targetNodeId: image.id, targetPortId: 'reference' },
    { id: 'video-reference', sourceNodeId: reference.id, sourcePortId: 'image', targetNodeId: video.id, targetPortId: 'reference-1' },
  ];
  const assets: AssetRecord[] = [{ id: asset.id, kind: 'image', name: 'unrelated-file-name.png', mimeType: 'image/png', width: 32, height: 32, createdAt: asset.createdAt, storage: { type: 'remote', assetId: asset.id } }];
  const ui = createEmptyProjectUiState(); ui.viewport = { x: 30, y: 30, zoom: 0.9 };
  const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [source, reference, image, video, subject], edges, assets }, ui);
  const document = { id: randomUUID(), name: 'QA Generate image flow', workspaceId: owner.workspaceId, revision: 1,
    schemaVersion: snapshot.schemaVersion, snapshot, favorite: false, hasEverHadContent: true, status: 'active', thumbnailAvailable: false, thumbnailMode: 'auto', thumbnailUrl: '' };
  await page.route(`**/api/projects/${document.id}/thumbnail`, (route) => route.fulfill({ json: { project: document } }));
  await page.route(`**/api/projects/${document.id}`, (route) => {
    if (route.request().method() === 'PATCH') { document.snapshot = route.request().postDataJSON().snapshot; document.revision++; }
    return route.fulfill({ json: { project: document } });
  });
  let paidCalls = 0;
  await page.route('**/api/ai/**', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    paidCalls++; return route.abort();
  });
  const card = page.locator(`[data-node-id="${image.id}"]`);
  const sourceCard = page.locator(`[data-node-id="${source.id}"]`);
  const sectionPort = (label: string) => card.locator(`button.node-port[data-port-id="${getGeneratePromptSectionPortId(label)}"]`);
  const sourceEditor = sourceCard.getByRole('textbox').first();
  try {
    await page.goto(`/projects/${document.id}`);
    await expect(card.locator('.composing-row')).toHaveCount(0);
    await expect(card.locator('.node-section-title strong')).toHaveText(['Prompt', 'Reference', 'Settings', 'Result']);
    const generateY = (await card.getByRole('button', { name: 'Generate', exact: true }).boundingBox())!.y;
    const resultY = (await card.getByRole('button', { name: 'Result', exact: true }).boundingBox())!.y;
    expect(resultY).toBeGreaterThan(generateY);
    await expect(card.locator('.input-pill-reference')).toHaveText('Мой герой');
    await expect(page.locator(`[data-node-id="${video.id}"] .input-pill-reference`)).toHaveText('Мой герой');
    await expect(page.locator(`[data-node-id="${subject.id}"] .input-pill-reference`)).toHaveText('Мой герой');
    await sourceEditor.fill('');
    await sourceEditor.evaluate((element, text) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', text);
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    }, 'Opening\n[Actors]\nAlice\n[Свободный тег]\nClouds');
    await expect(sectionPort('Actors')).toBeVisible();
    await expect(sectionPort('Свободный тег')).toBeVisible();
    await expect.poll(() => document.snapshot.project.edges.filter((edge) => edge.promptSourceEdgeId === 'prompt-link').length).toBe(2);
    await expect(sectionPort('Actors')).toHaveClass(/node-port-connected/);
    await expect(card.locator('button.node-port[data-port-id="prompt"]')).not.toHaveClass(/node-port-connected/);
    expect(document.snapshot.project.edges.some((edge) => edge.targetPortId === 'prompt')).toBe(false);
    const titles = await card.locator('.node-section-title strong').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().x));
    expect(Math.abs(titles[0]! - titles[2]!)).toBeLessThan(1);
    expect(Math.abs(titles[1]! - titles[2]!)).toBeLessThan(1);
    const badge = card.locator('.input-pill-reference');
    expect((await badge.boundingBox())!.width).toBeLessThan(85);
    await badge.hover();
    await card.getByRole('button', { name: 'Disconnect Мой герой' }).click();
    await expect(badge).toHaveCount(0);
    await expect.poll(() => document.snapshot.project.edges.some((edge) => edge.id === 'image-reference')).toBe(false);
    await expect(page.locator(`[data-node-id="${video.id}"] .input-pill-reference`)).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(badge).toBeVisible();

    await card.getByRole('button', { name: 'Prompt', exact: true }).click();
    await expect(sectionPort('Actors')).toBeHidden();
    await card.getByRole('button', { name: 'Prompt', exact: true }).click();
    await expect(sectionPort('Actors')).toBeVisible();
    await page.reload();
    await expect(sectionPort('Actors')).toBeVisible();
    await expect(sectionPort('Свободный тег')).toBeVisible();

    const cut = await page.locator('.edge-path[data-edge-id]').evaluateAll((paths) => {
      const tagged = paths.filter((path) => path.getAttribute('data-edge-id')?.startsWith('prompt-section:')) as SVGPathElement[];
      const first = tagged[0]!;
      const matrix = first.getScreenCTM()!;
      const start = first.getPointAtLength(0).matrixTransform(matrix);
      const end = first.getPointAtLength(first.getTotalLength()).matrixTransform(matrix);
      const x = (start.x + end.x) / 2;
      const ys = tagged.map((path) => Array.from({ length: 201 }, (_, i) => path.getPointAtLength(path.getTotalLength() * i / 200).matrixTransform(path.getScreenCTM()!))
        .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0]!.y);
      return { x, top: Math.min(...ys) - 12, bottom: Math.max(...ys) + 12 };
    });
    await page.getByRole('button', { name: 'Cut connections', exact: true }).click();
    await page.mouse.move(cut.x, cut.top); await page.mouse.down();
    await page.mouse.move(cut.x, cut.bottom, { steps: 12 });
    await expect(page.locator('.canvas-cut-preview')).toBeVisible();
    await expect(page.locator('.edge-path-cut-pending')).toHaveCount(2);
    await expect(page.locator('.edge-path-cut-pending').first()).toHaveCSS('filter', 'brightness(0.42)');
    await expect(page.locator('.canvas-cut-preview polyline')).toHaveCSS('stroke', 'rgb(245, 130, 32)');
    if (process.env.GENERATE_IMAGE_SCREENSHOT) await page.screenshot({ path: '/tmp/scissors-cut-preview.png' });

    expect(document.snapshot.project.edges.filter((edge) => edge.promptSourceEdgeId).length).toBe(2);
    await page.mouse.up();
    await expect(page.locator('.edge-path[data-edge-id^="prompt-section:"]')).toHaveCount(0);
    await expect(sectionPort('Actors')).not.toHaveClass(/node-port-connected/);
    await expect.poll(() => document.snapshot.project.edges.filter((edge) => edge.promptSourceEdgeId).length).toBe(0);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.edge-path[data-edge-id^="prompt-section:"]')).toHaveCount(2);

    await page.mouse.move(cut.x, cut.top); await page.mouse.down();
    await page.mouse.move(cut.x, cut.bottom, { steps: 6 });
    await expect(page.locator('.edge-path-cut-pending')).toHaveCount(2);
    await page.keyboard.press('Escape'); await page.mouse.up();
    await expect(page.locator('.canvas-cut-preview')).toHaveCount(0);
    await expect(page.locator('.edge-path[data-edge-id^="prompt-section:"]')).toHaveCount(2);
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('.edge-path[data-edge-id^="prompt-section:"]')).toHaveCount(0);
    await expect.poll(() => document.snapshot.project.edges.filter((edge) => edge.promptSourceEdgeId).length).toBe(0);
    await page.reload();
    await expect(sectionPort('Actors')).toBeVisible();
    await expect(page.locator('.edge-path[data-edge-id^="prompt-section:"]')).toHaveCount(0);
    expect(paidCalls).toBe(0);
    if (process.env.GENERATE_IMAGE_SCREENSHOT) await page.screenshot({ path: process.env.GENERATE_IMAGE_SCREENSHOT });
    await sourceEditor.fill('No sections now');
    await expect(card.locator('.composing-row')).toHaveCount(0);
    await expect.poll(() => document.snapshot.project.edges.filter((edge) => edge.promptSourceEdgeId).length).toBe(0);
    expect(paidCalls).toBe(0);
  } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
});
