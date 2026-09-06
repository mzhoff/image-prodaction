import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createPipelineContractField } from '../src/entities/production-graph/model/pipeline-contract-fields';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import { wrapSpeechPcmAsWav } from '../src/shared/media/speech-wave';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1600, height: 1000 } });

test('audio canvas uploads, plays and seeks managed audio, converts it, connects Output and persists collapsed state', async ({ page }, testInfo) => {
  test.skip(process.env.AUDIO_LOCAL_E2E !== '1', 'Explicit local-only audio QA opt-in is required.');
  test.setTimeout(180_000);
  const origin = testInfo.project.use.baseURL!;
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(origin).hostname);
  const owner = await createAudioQaOwner(origin, 'canvas');
  await page.context().addCookies(owner.http.browserSessionCookies());
  const workspaceId = owner.workspaceId;
  const created = await page.request.post('/api/projects', { headers: { origin }, data: { workspaceId, name: 'Audio canvas local QA' } });
  expect(created.status()).toBe(201);
  const document = (await created.json()).project;
  const imported = createDefaultNode('importImage', { x: 20, y: 100 });
  const convert = createDefaultNode('audioConvert', { x: 500, y: 100 });
  const output = createDefaultNode('pipelineOutput', { x: 1010, y: 100 });
  const transcribe = createDefaultNode('speechToText', { x: 20, y: 440 });
  const voice = createDefaultNode('textToSpeech', { x: 20, y: 550 });
  const field = createPipelineContractField(0, { key: 'audio', kind: 'audio' });
  output.data = { title: 'Pipeline Output', fields: [field] };
  const project = { ...structuredClone(initialProject), nodes: [imported, convert, output, transcribe, voice],
    edges: [{ id: 'qa-output-edge', sourceNodeId: convert.id, sourcePortId: 'audio', targetNodeId: output.id, targetPortId: `field:${field.id}` }] };
  const uiState = createEmptyProjectUiState(); uiState.viewport = { x: 30, y: 70, zoom: 0.9 };
  uiState.nodes[transcribe.id] = { state: 'Collapsed', collapsed: true };
  uiState.nodes[voice.id] = { state: 'Collapsed', collapsed: true };
  const seeded = await page.request.patch(`/api/projects/${document.id}`, { headers: { origin }, data: {
    expectedRevision: document.revision, snapshot: createProjectExport(project, uiState),
  } });
  expect(seeded.status()).toBe(200);
  // This scenario uses only local conversion. Unexpected paid operations are blocked explicitly.
  await page.route('**/api/ai/transcribe-audio', (route) => route.abort('blockedbyclient'));
  await page.route('**/api/ai/generate-speech', (route) => route.abort('blockedbyclient'));
  await page.goto(`/projects/${document.id}`);
  await expect(page.getByRole('textbox', { name: 'Pipeline name', exact: true })).toHaveValue('Audio canvas local QA');
  const importCard = page.locator(`[data-node-id="${imported.id}"]`);
  const convertCard = page.locator(`[data-node-id="${convert.id}"]`);
  const outputCard = page.locator(`[data-node-id="${output.id}"]`);
  const transcribeCard = page.locator(`[data-node-id="${transcribe.id}"]`);
  const voiceCard = page.locator(`[data-node-id="${voice.id}"]`);
  await expect(importCard.getByRole('button', { name: 'Upload image or audio', exact: true })).toBeVisible();
  await expect(transcribeCard.locator('[data-port-id="audio"]')).toHaveClass(/node-port-data-audio/);
  await expect(transcribeCard.locator('[data-port-id="text"]')).toHaveClass(/node-port-data-text/);
  await expect(voiceCard.locator('[data-port-id="audio"]')).toHaveClass(/node-port-data-audio/);
  await expect(voiceCard.getByRole('button', { name: 'Expand node', exact: true })).toBeVisible();
  const uploaded = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/assets/audio'));
  await importCard.locator('input[type=file]').setInputFiles({ name: 'audio-qa.wav', mimeType: 'audio/wav',
    buffer: Buffer.from(wrapSpeechPcmAsWav(new Uint8Array(24_000 * 2 * 2))) });
  const uploadedResponse = await uploaded;
  expect(uploadedResponse.status()).toBe(201);
  const uploadedAsset = (await uploadedResponse.json()).asset;
  expect(uploadedAsset.audio.durationSeconds).toBeCloseTo(2, 1);
  const player = importCard.locator('audio');
  await expect(player).toBeVisible();
  await expect.poll(() => player.evaluate((audio) => (audio as HTMLAudioElement).duration)).toBeCloseTo(2, 1);
  await player.evaluate(async (element) => { const audio = element as HTMLAudioElement; audio.muted = true; await audio.play(); });
  await expect.poll(() => player.evaluate((audio) => (audio as HTMLAudioElement).paused)).toBe(false);
  await player.evaluate((element) => { const audio = element as HTMLAudioElement; audio.pause(); audio.currentTime = 1; });
  await expect.poll(() => player.evaluate((audio) => (audio as HTMLAudioElement).currentTime)).toBeCloseTo(1, 1);
  const sourcePort = importCard.locator('[data-port-id="image"]');
  const targetPort = convertCard.locator('.node-port[data-port-id="source"]');
  await expect(sourcePort).toHaveClass(/node-port-data-audio/);
  await expect(sourcePort).toHaveCSS('--port-color', '#c026d3');
  const from = await sourcePort.boundingBox(); const to = await targetPort.boundingBox();
  expect(Boolean(from && to)).toBe(true);
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2); await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 }); await page.mouse.up();
  await expect(convertCard.getByRole('button', { name: 'Convert audio', exact: true })).toBeEnabled();
  const converted = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/ai/convert-audio'));
  await convertCard.getByRole('button', { name: 'Convert audio', exact: true }).click();
  const convertedResponse = await converted; expect(convertedResponse.status()).toBe(200);
  const convertedAsset = (await convertedResponse.json()).asset;
  expect(convertedAsset.contentType).toBe('audio/mpeg');
  await expect(convertCard.locator('audio')).toHaveCount(2);
  await expect.poll(() => convertCard.locator('audio').last().evaluate((audio) => (audio as HTMLAudioElement).duration)).toBeGreaterThan(1.9);
  await expect(outputCard.locator('[data-port-id^="field:"]')).toHaveClass(/node-port-data-audio/);
  await expect(page.locator('.edge-path-audio:not(.edge-path-empty)')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('audio-canvas-wide.png'), fullPage: true });
  await convertCard.getByRole('button', { name: 'Collapse node', exact: true }).click();
  await expect(convertCard.locator('audio')).toHaveCount(0);
  await expect(convertCard.locator('[data-port-id="source"]')).toBeVisible();
  await expect(convertCard.locator('[data-port-id="audio"]')).toBeVisible();
  await expect.poll(async () => {
    const saved = await page.request.get(`/api/projects/${document.id}`);
    const snapshot = (await saved.json()).project.snapshot;
    return snapshot?.uiState?.nodes?.[convert.id]?.collapsed;
  }).toBe(true);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Pipeline name', exact: true })).toHaveValue('Audio canvas local QA');
  await expect(convertCard.getByRole('button', { name: 'Expand node', exact: true })).toBeVisible();
  await expect(importCard.locator('audio')).toBeVisible();
  await convertCard.getByRole('button', { name: 'Expand node', exact: true }).click();
  await expect(convertCard.locator('audio')).toHaveCount(2);
  await expect.poll(() => convertCard.locator('audio').last().evaluate((audio) => (audio as HTMLAudioElement).duration)).toBeGreaterThan(1.9);
  await page.screenshot({ path: testInfo.outputPath('audio-canvas-reloaded.png'), fullPage: true });
  await testInfo.attach('audio-canvas-safe-identifiers', { body: JSON.stringify({ workspaceId, documentId: document.id,
    uploadedAssetId: uploadedAsset.id, convertedAssetId: convertedAsset.id }), contentType: 'application/json' });
});
