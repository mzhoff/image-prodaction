import { gotoQaSection } from './release-user-fixture';
import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import { createAudioQaOwner, createAudioQaWave } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1600, height: 1100 } });

test('Import video ports and long Voice recovery use the current UI without paid calls', async ({ page }, testInfo) => {
  test.skip(process.env.AUDIO_LOCAL_E2E !== '1', 'Explicit local-only QA is required.');
  const origin = testInfo.project.use.baseURL!;
  expect(['localhost', '127.0.0.1']).toContain(new URL(origin).hostname);
  // Authentication uses the existing local application; all media/generation in this UI test is mocked.
  const owner = await createAudioQaOwner('http://localhost:3004', 'video-long-voice-ui');
  await page.context().addCookies(owner.http.browserSessionCookies());
  const created = await owner.http.request('/api/projects', { json: { workspaceId: owner.workspaceId, name: 'Video and long Voice UI QA' } });
  expect(created.status).toBe(201);
  const document = (await created.json()).project;
  const prompt = createDefaultNode('textPrompt', { x: 20, y: 60 });
  const voice = createDefaultNode('textToSpeech', { x: 500, y: 60 });
  const imported = createDefaultNode('importImage', { x: 980, y: 60 });
  prompt.data = { ...prompt.data, text: 'Это тестовое предложение для длинной озвучки без реальной генерации. '.repeat(100) };
  voice.data = { ...voice.data, model: 'google/gemini-3.1-flash-tts-preview' };
  const sourceId = '01900000-0000-7000-8000-000000000111';
  const audioId = '01900000-0000-7000-8000-000000000112';
  const video = { container: 'mov', codec: 'prores', contentType: 'video/quicktime', durationSeconds: 2,
    width: 320, height: 180, frameRate: 24, rotationDegrees: 0, browserPlayable: false,
    audioTracks: [{ index: 1, codec: 'aac', channels: 2, sampleRateHz: 48000, isDefault: true },
      { index: 2, codec: 'aac', channels: 2, sampleRateHz: 48000, isDefault: false }] };
  const audio = { container: 'wav', codec: 'pcm_s16le', contentType: 'audio/wav', durationSeconds: 0.5, sampleRateHz: 8000, channels: 1 };
  const sourceDto = { id: sourceId, originalName: 'synthetic-video.mov', contentType: video.contentType, createdAt: new Date().toISOString(), video };
  const audioDto = { id: audioId, originalName: 'synthetic-voice.wav', contentType: audio.contentType, createdAt: sourceDto.createdAt, audio, byteSize: 8044 };
  const uiState = createEmptyProjectUiState(); uiState.viewport = { x: 30, y: 70, zoom: 0.9 };
  let snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [prompt, voice, imported], edges: [
    { id: 'text-voice', sourceNodeId: prompt.id, sourcePortId: 'text', targetNodeId: voice.id, targetPortId: 'text' },
  ] }, uiState);
  await page.route(`**/api/projects/${document.id}`, async (route) => {
    if (route.request().method() === 'PATCH') snapshot = route.request().postDataJSON().snapshot;
    await route.fulfill({ json: { project: { ...document, snapshot, revision: ++document.revision } } });
  });
  await page.route('**/api/assets/video', (route) => route.fulfill({ status: 201, json: { asset: sourceDto } }));
  const derivations: { kind: string; audioTrackIndex?: number }[] = [];
  await page.route('**/api/assets/video/derive', (route) => {
    const input = route.request().postDataJSON(); derivations.push(input);
    return route.fulfill({ json: { asset: input.kind === 'audio' ? audioDto : { ...sourceDto, id: `${sourceId.slice(0, -1)}3`,
      contentType: 'video/mp4', video: { ...video, container: 'mp4', codec: 'h264', contentType: 'video/mp4', browserPlayable: true, audioTracks: [] } } } });
  });
  await page.route('**/api/assets/*/content', (route) => route.fulfill({ contentType: 'audio/wav', body: createAudioQaWave() }));
  await page.route('**/api/assets/*/metadata', (route) => route.fulfill({ json: { asset: route.request().url().includes(audioId) ? audioDto : sourceDto } }));
  let speechPosts = 0; let finish = false; let polls = 0;
  const jobId = '01900000-0000-7000-8000-000000000119';
  await page.route('**/api/ai/generate-speech', (route) => {
    speechPosts++; expect(route.request().postDataJSON().inputText.length).toBeGreaterThan(5000);
    return route.fulfill({ status: 202, json: { job: { id: jobId, status: 'queued' }, progress: { completedParts: 0, totalParts: 3, phase: 'queued' } } });
  });
  await page.route(`**/api/generation-jobs/${jobId}`, (route) => {
    polls++;
    return route.fulfill({ json: finish ? { job: { id: jobId, status: 'succeeded' }, asset: audioDto }
      : { job: { id: jobId, status: 'running' }, progress: { completedParts: 1, totalParts: 3, phase: 'generating' } } });
  });
  await gotoQaSection(page, `/projects/${document.id}`);
  const importedCard = page.locator(`[data-node-id="${imported.id}"]`);
  const voiceCard = page.locator(`[data-node-id="${voice.id}"]`);
  await importedCard.locator('input[type="file"]').setInputFiles({ name: 'synthetic-video.mov', mimeType: 'video/quicktime', buffer: Buffer.from('UI fixture only') });
  await expect(importedCard.getByText('Original · video + audio', { exact: true })).toBeVisible();
  for (const port of ['original', 'video', 'audio']) await expect(importedCard.locator(`[data-port-id="${port}"]`)).toHaveCount(1);
  await expect(importedCard.locator('[data-port-id="audio"]')).toHaveClass(/node-port-data-audio/u);
  await importedCard.getByRole('button', { name: 'Extract audio', exact: true }).click();
  await expect(importedCard.locator('audio')).toHaveCount(1);
  expect(derivations[0]).toMatchObject({ kind: 'audio', audioTrackIndex: 1 });
  await importedCard.getByRole('button', { name: 'Prepare video', exact: true }).click();
  await expect.poll(() => derivations.length).toBe(2);
  expect(derivations[1]).toMatchObject({ kind: 'video-only' });
  expect(derivations[1].audioTrackIndex).toBeUndefined();
  await importedCard.getByRole('button', { name: '1. aac · Default', exact: true }).click();
  await page.getByRole('option', { name: '2. aac', exact: true }).click();
  await expect(importedCard.getByRole('button', { name: 'Extract audio', exact: true })).toBeEnabled();
  await expect(importedCard.getByRole('button', { name: 'Ready', exact: true })).toHaveCount(1);
  await voiceCard.getByRole('button', { name: 'Generate Voice', exact: true }).click();
  await expect(voiceCard.getByRole('status')).toContainText('1 / 3 parts ready');
  await expect.poll(() => snapshot.project.nodes.find((node) => node.id === voice.id)?.data).toMatchObject({ speechRequest: { jobId } });
  const previousPolls = polls;
  await page.reload();
  await expect.poll(() => polls).toBeGreaterThan(previousPolls);
  expect(speechPosts).toBe(1);
  finish = true;
  await expect(voiceCard.getByRole('button', { name: 'Generate Voice', exact: true })).toBeEnabled();
  await expect(voiceCard.getByRole('button', { name: 'Play audio', exact: true })).toBeVisible();
  expect(speechPosts).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('video-long-voice-ui.png'), fullPage: true });
});
