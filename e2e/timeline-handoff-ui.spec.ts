import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import { timelineShotFingerprint, type TimelineAnalysis } from '../src/shared/media/timeline-contracts';
import type { VideoMetadata } from '../src/shared/media/video-contracts';
import type { TimelineHandoffNodeData } from '../src/entities/production-graph/model/types';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1500, height: 1500 } });
const STILL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');

test('Timeline stages, exact frame editing, multiple stills, fullscreen and recovery never start AI implicitly', async ({ page }, testInfo) => {
  test.skip(process.env.TIMELINE_LOCAL_E2E !== '1', 'Explicit local-only Timeline UI QA is required.');
  const origin = testInfo.project.use.baseURL!;
  expect(['localhost', '127.0.0.1']).toContain(new URL(origin).hostname);
  const owner = await createAudioQaOwner(process.env.TIMELINE_QA_AUTH_ORIGIN ?? origin, 'timeline-ui');
  await page.context().addCookies(owner.http.browserSessionCookies());
  const created = await owner.http.request('/api/projects', { json: { workspaceId: owner.workspaceId, name: 'Timeline UI local QA' } });
  expect(created.status).toBe(201);
  const document = (await created.json()).project;
  const sourceId = '01900000-0000-7000-8000-000000000111';
  const video: VideoMetadata = { container: 'mp4', codec: 'h264', contentType: 'video/mp4', durationSeconds: 1.2,
    width: 320, height: 180, frameRate: 24, rotationDegrees: 0, browserPlayable: true, audioTracks: [] };
  const imported = createDefaultNode('importImage', { x: -500, y: 40 });
  imported.data = { ...imported.data, mediaKind: 'video', assetId: sourceId };
  const handoff = createDefaultNode('timelineHandoff', { x: 70, y: 40 });
  const asset = { id: sourceId, kind: 'video' as const, name: 'Synthetic QA video.mp4', mimeType: 'video/mp4', video,
    createdAt: new Date().toISOString(), storage: { type: 'remote' as const, assetId: sourceId } };
  const analysis: TimelineAnalysis = { version: 1, sourceAssetId: sourceId, sourceChecksum: 'a'.repeat(64), durationMs: 1200,
    frameTimesMs: [0, 40, 80, 120, 200, 280, 400, 600, 840, 1000],
    shots: [{ id: 'first', startMs: 0, endMs: 400, frames: [{ timeMs: 120 }], description: '' },
      { id: 'second', startMs: 400, endMs: 1200, frames: [{ timeMs: 840 }], description: '' }] };
  const uiState = createEmptyProjectUiState(); uiState.viewport = { x: 30, y: 50, zoom: 0.85 };
  let snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [imported, handoff], assets: [asset], edges: [
    { id: 'video-timeline', sourceNodeId: imported.id, sourcePortId: 'original', targetNodeId: handoff.id, targetPortId: 'video' },
  ] }, uiState);
  await page.route(`**/api/projects/${document.id}`, async (route) => {
    if (route.request().method() === 'PATCH') snapshot = route.request().postDataJSON().snapshot;
    await route.fulfill({ json: { project: { ...document, snapshot, revision: ++document.revision } } });
  });
  await page.route('**/api/assets/*/metadata', (route) => route.fulfill({ json: { asset: { id: sourceId, originalName: asset.name, contentType: asset.mimeType, createdAt: asset.createdAt, video } } }));
  await page.route('**/api/assets/*/content', (route) => route.fulfill({ status: 204 }));
  await page.route('**/api/timeline/frame?*', (route) => route.fulfill({ contentType: 'image/png', body: STILL }));
  const requests: Array<{ action: string; idempotencyKey: string; shots?: TimelineAnalysis['shots'] }> = [];
  const jobId = '01900000-0000-7000-8000-000000000119';
  let finishDescriptions = false;
  let loseAcceptance = false;
  let failNextPoll = false;
  let polls = 0;
  await page.route('**/api/timeline', (route) => {
    const payload = route.request().postDataJSON(); requests.push(payload);
    if (loseAcceptance && payload.action === 'describe') { loseAcceptance = false; return route.abort('failed'); }
    return route.fulfill({ json: payload.action === 'analyze' ? { job: { id: jobId, status: 'succeeded' }, result: analysis }
      : { job: { id: jobId, status: 'queued' }, result: null } });
  });
  await page.route(`**/api/timeline/jobs/${jobId}`, (route) => {
    polls++;
    if (failNextPoll) { failNextPoll = false; return route.fulfill({ status: 503, json: { error: { message: 'Simulated connection interruption' } } }); }
    const shots = requests.at(-1)!.shots!;
    return route.fulfill({ json: finishDescriptions ? { job: { id: jobId, status: 'succeeded' }, result: {
      sourceAssetId: sourceId, sourceChecksum: analysis.sourceChecksum, shots: shots.map((shot) => ({ id: shot.id,
        description: `Short description for ${shot.id}.`, describedFingerprint: timelineShotFingerprint(shot) })) } }
      : { job: { id: jobId, status: 'running' }, result: null } });
  });
  await page.goto(`/projects/${document.id}`);
  const card = page.locator(`[data-node-id="${handoff.id}"]`);
  const data = () => snapshot.project.nodes.find((node) => node.id === handoff.id)!.data as TimelineHandoffNodeData;
  await expect(card.getByRole('button', { name: 'Analyze video', exact: true })).toBeEnabled();
  await card.getByRole('button', { name: 'Analyze video', exact: true }).click();
  await expect(card.getByText('Shot 1 / 2', { exact: true })).toBeVisible();
  const headings = await card.locator('.node-section-title strong').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().left));
  expect(Math.max(...headings) - Math.min(...headings)).toBeLessThan(1);
  await card.getByRole('button', { name: 'End one frame later', exact: true }).click();
  await expect.poll(() => data().analysis?.shots.map((shot) => [shot.startMs, shot.endMs])).toEqual([[0, 600], [600, 1200]]);
  await card.getByRole('button', { name: 'Next frame', exact: true }).click();
  await card.getByRole('button', { name: 'Use frame', exact: true }).click();
  await expect.poll(() => data().analysis?.shots[0]?.frames.length).toBe(2);
  expect(requests.filter((request) => request.action === 'describe')).toHaveLength(0);
  await card.getByRole('button', { name: 'Previous shot', exact: true }).click();
  await expect(card.getByText('Shot 2 / 2', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Next shot', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('timeline-handoff-expanded.png'), fullPage: true });
  await card.getByRole('button', { name: 'Open timeline fullscreen', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Timeline Handoff', exact: true });
  await expect(editor.getByRole('row')).toHaveCount(3);
  await expect(editor.locator('video')).toHaveCount(1);
  await expect(card.locator('video')).toHaveCount(0);
  await editor.getByRole('button', { name: 'Edit shot 2', exact: true }).click();
  await expect(editor.locator('video')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('timeline-handoff-fullscreen.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Open timeline fullscreen', exact: true })).toBeFocused();
  page.on('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Describe this shot', exact: true }).click();
  await expect.poll(() => data().request?.jobId).toBe(jobId);
  expect(requests.filter((request) => request.action === 'describe')).toHaveLength(1);
  const beforePolls = polls;
  await page.reload();
  await expect.poll(() => polls).toBeGreaterThan(beforePolls);
  finishDescriptions = true;
  await expect(card.getByRole('textbox', { name: 'Shot description', exact: true })).toHaveValue('Short description for second.');
  expect(requests.filter((request) => request.action === 'describe')).toHaveLength(1);
  await card.getByRole('button', { name: 'Start one frame earlier', exact: true }).click();
  await expect(card.getByText('Frames or boundaries changed. Review this description before using it.', { exact: true })).toBeVisible();
  // An accepted POST can lose its response before the job ID reaches the browser. Recover the SAME key after reload.
  await card.getByRole('button', { name: 'Previous shot', exact: true }).click();
  loseAcceptance = true;
  await card.getByRole('button', { name: 'Describe this shot', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Check result', exact: true })).toBeVisible();
  const lostKey = requests.at(-1)!.idempotencyKey;
  await page.reload();
  await expect(card.getByRole('button', { name: 'Check result', exact: true })).toBeVisible();
  failNextPoll = true;
  await card.getByRole('button', { name: 'Check result', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Finish request', exact: true })).toBeVisible();
  expect(requests.at(-1)!.idempotencyKey).toBe(lostKey);
  const postCountBeforeFinish = requests.length;
  // Finish must retrieve a completed result missed during the connection failure, not discard a paid description.
  await card.getByRole('button', { name: 'Finish request', exact: true }).click();
  await expect(card.getByRole('textbox', { name: 'Shot description', exact: true })).toHaveValue('Short description for first.');
  expect(requests.length).toBe(postCountBeforeFinish);
  const descriptions = requests.filter((request) => request.action === 'describe');
  expect(descriptions).toHaveLength(3);
  expect(new Set(descriptions.map((request) => request.idempotencyKey)).size).toBe(2);
  await card.getByRole('button', { name: 'Collapse node', exact: true }).click();
  await expect(card.locator('[data-port-id="video"]')).toBeVisible();
  await expect(card.locator('[data-port-id="timeline"]')).toBeVisible();
  await expect(card.getByRole('textbox', { name: 'Shot description', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('timeline-handoff-ui.png'), fullPage: true });
});
