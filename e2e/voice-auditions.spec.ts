import { gotoQaSection } from './release-user-fixture';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import { createFallbackCatalog } from '../src/shared/api/openrouter-models';
import { createAudioQaOwner, createAudioQaWave } from './audio-runtime-fixtures';

test.use({ channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL, trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1250 } });

test('voice selector identifies gender, explains missing recordings and auditions static audio without generation', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'voice-auditions');
  await context.addCookies(owner.http.browserSessionCookies());
  const voices = [120, 610].map((x) => {
    const node = createDefaultNode('textToSpeech', { x, y: 60 });
    return { ...node, data: { ...node.data, model: 'google/gemini-3.1-flash-tts-preview', voice: 'Kore', language: 'ru' } };
  });
  const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: voices }, createEmptyProjectUiState());
  const document = { id: randomUUID(), name: 'QA Voice auditions', workspaceId: owner.workspaceId, revision: 1,
    schemaVersion: snapshot.schemaVersion, snapshot, favorite: false, hasEverHadContent: true,
    status: 'active', thumbnailAvailable: false, thumbnailMode: 'auto', thumbnailUrl: '' };
  let published = false, broken = false, mediaRequests = 0, paidCalls = 0;
  // Synthetic test tone, not a speech sample or evidence of a provider voice's sound.
  const tone = createAudioQaWave(), audio = Buffer.concat([tone.subarray(0, 44), ...Array(16).fill(tone.subarray(44))]);
  audio.writeUInt32LE(audio.length - 8, 4); audio.writeUInt32LE(audio.length - 44, 40);
  await page.addInitScript(() => {
    const audios: HTMLAudioElement[] = [];
    Object.assign(window, { qaVoiceAudios: audios });
    const NativeAudio = window.Audio;
    window.Audio = class extends NativeAudio {
      constructor(src?: string) { super(src); this.volume = 0; audios.push(this); }
    };
  });
  await page.route('**/api/ai/**', (route) => {
    if (route.request().url().endsWith('/models')) return route.fulfill({ json: createFallbackCatalog() });
    if (route.request().method() === 'GET') return route.continue();
    paidCalls++; return route.abort();
  });
  await page.route('**/voice-previews/**', (route) => {
    if (route.request().url().endsWith('/manifest.json')) return route.fulfill({ json: { version: 1, samples: published ? [
      { model: 'google/gemini-3.1-flash-tts-preview', voice: 'Kore', language: 'ru', src: '/voice-previews/qa/kore.wav' },
      { model: 'google/gemini-3.1-flash-tts-preview', voice: 'Puck', language: 'ru', src: '/voice-previews/qa/puck.wav' },
    ] : [] } });
    mediaRequests++;
    return broken ? route.fulfill({ status: 404 }) : route.fulfill({ contentType: 'audio/wav', body: audio });
  });
  await page.route(`**/api/projects/${document.id}/thumbnail`, (route) => route.fulfill({ json: { project: document } }));
  await page.route(`**/api/projects/${document.id}`, async (route) => {
    if (route.request().method() === 'PATCH') { document.snapshot = route.request().postDataJSON().snapshot; document.revision++; }
    await route.fulfill({ json: { project: document } });
  });
  const node = page.locator(`[data-node-id="${voices[0].id}"]`);
  const second = page.locator(`[data-node-id="${voices[1].id}"]`);
  const play = node.locator('.voice-preview-button');
  const playingCount = () => page.evaluate(() => (window as typeof window & { qaVoiceAudios: HTMLAudioElement[] }).qaVoiceAudios.filter((item) => !item.paused).length);
  try {
    await gotoQaSection(page, `/projects/${document.id}`);
    await expect(play).toHaveAttribute('aria-disabled', 'true');
    await play.focus();
    await expect(page.locator('.pro-tooltip')).toContainText('образец ещё не записан');
    await play.press('Enter'); expect(mediaRequests).toBe(0); expect(paidCalls).toBe(0);
    await node.getByRole('button', { name: 'Voice', exact: true }).click();
    await expect(page.getByRole('option', { name: /Kore/ }).getByRole('img')).toHaveAttribute('aria-label', 'Женский голос');
    await expect(page.getByRole('option', { name: /Puck/ }).getByRole('img')).toHaveAttribute('aria-label', 'Мужской голос');
    await page.getByRole('option', { name: /Kore/ }).click();
    await node.screenshot({ path: '/tmp/image-production-voice-auditions.png' });
    published = true;
    await page.reload();
    await expect(play).toHaveAttribute('aria-disabled', 'false');
    expect(mediaRequests).toBe(0); // No autoplay or eager audio download.
    await play.click(); await expect(play).toHaveAttribute('aria-pressed', 'true');
    await second.locator('.voice-preview-button').click();
    await expect(second.locator('.voice-preview-button')).toHaveAttribute('aria-pressed', 'true');
    await expect(play).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(playingCount).toBe(1);
    await second.getByRole('button', { name: 'Voice', exact: true }).click();
    await page.getByRole('option', { name: /Puck/ }).click();
    await expect.poll(playingCount).toBe(0);
    await play.click(); await expect(play).toHaveAttribute('aria-pressed', 'true');
    const modelRow = node.locator('.setting-row').filter({ has: page.locator('span:text-is("Model")') });
    await modelRow.getByRole('button').click(); await page.getByRole('button', { name: 'Grok Voice TTS', exact: true }).click();
    await expect.poll(playingCount).toBe(0);
    await expect(play).toHaveAttribute('aria-disabled', 'true');
    await expect(node.locator('.voice-gender-icon')).toHaveAttribute('aria-label', 'Пол голоса не подтверждён');
    broken = true;
    await second.locator('.voice-preview-button').click();
    await expect(second.locator('.voice-preview-button')).toHaveAttribute('aria-label', /Не удалось воспроизвести/);
    broken = false;
    await second.locator('.voice-preview-button').click();
    await expect(second.locator('.voice-preview-button')).toHaveAttribute('aria-pressed', 'true');
    await second.locator('.voice-preview-button').click();
    await expect.poll(playingCount).toBe(0);
    await page.emulateMedia({ colorScheme: 'dark' });
    await node.screenshot({ path: '/tmp/image-production-voice-auditions-dark.png' });
    expect(paidCalls).toBe(0);
  } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
});
