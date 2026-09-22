import { test, expect, type Page } from '@playwright/test';
import { checkTimelineLayout, checkTimelineClipEditing } from './timeline-layout-assertions';
import { checkTimelineControls } from './timeline-controls-assertions';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createAudioQaOwner } from './audio-runtime-fixtures';
import type { TimelineDocument } from '../src/modules/story-projects/contracts/story-timeline';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1100 } });
test('Home presets → scenes and tracks → reviewed rhythm → AI proposal → MP4', async ({ page, context, baseURL }) => {
  test.setTimeout(180_000); test.skip(process.env.TIMELINE_PRODUCTION_UI_QA !== '1');
  const url = new URL(baseURL!); if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local QA only');
  await page.addLocatorHandler(page.getByRole('button', { name: 'Начать работу', exact: true }), async (button) => { await button.click(); });
  const owner = await createAudioQaOwner(url.origin, 'timeline-production'); await context.addCookies(owner.http.browserSessionCookies());
  const audioId = randomUUID(), videoId = randomUUID(), gridId = randomUUID(), planId = randomUUID(), renderId = randomUUID(), sceneId = randomUUID(), uploadId = randomUUID();
  const music = { version: 1, assetId: audioId, checksum: 'a'.repeat(64), durationMs: 30_000, sourceInMs: 0, confidence: 1, bpm: 120, method: 'manual', beatsMs: [0, 500], energy: [] };
  const slots = [4500, 2500, 3000, 1000, 5000, 4000, 2000, 3000, 5000].map((durationMs, index, durations) => ({ id: `slot-${index}`, durationMs, startMs: durations.slice(0, index).reduce((sum, value) => sum + value, 0), energy: 0.5, role: 'build' }));
  const documents = new Map<string, TimelineDocument>(); let id = '', reviewedDuration = 0, uploads = 0;
  let offlineWrites = false, saveDelayMs = 0, saveRequests = 0, forceConflict = false;
  const actions: string[] = [], errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const assets = [{ id: audioId, originalName: 'Music QA.wav', status: 'ready', mediaKind: 'audio', audio: { durationSeconds: 60 } }, { id: videoId, originalName: 'Video QA.mp4', status: 'ready', mediaKind: 'video', video: { durationSeconds: 60, browserPlayable: true } }];
  const images = Array.from({ length: 16 }, (_, index) => ({ id: randomUUID(), originalName: `Photo ${index + 1}.png`, status: 'ready', mediaKind: 'image' }));
  for (const image of images) await page.route(`**/api/assets/${image.id}/content`, (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="#73a8a0"/></svg>' }));
  const preview = await previewVideo(page);
  await page.route(`**/api/assets/${videoId}/content`, (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), preview.length - 1) : preview.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/webm', headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${preview.length}` } : {}) }, body: preview.subarray(start, end + 1) });
  });
  await page.route(`**/api/assets/${audioId}/content`, (route) => route.fulfill({ contentType: 'audio/wav', body: silentAudio() }));
  await page.route('**/api/chat/v1/**/turn*', (route) => route.abort());
  await page.route('**/api/assets?**', (route) => route.fulfill({ json: { items: [...assets, ...images], nextCursor: null } }));
  await page.route('**/api/assets/*', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/audio') && route.request().method() === 'POST') { uploads++; await route.fulfill({ status: 202, json: { job: { id: uploadId } } }); return; }
    const asset = assets.find((item) => path.endsWith(item.id)); if (asset) await route.fulfill({ json: { asset } }); else await route.continue();
  });
  await page.route(`**/api/generation-jobs/${uploadId}`, (route) => route.fulfill({ json: { job: { id: uploadId, status: 'succeeded' }, asset: { ...assets[0], originalName: 'Uploaded music.wav' } } }));
  await page.route('**/api/stories/timelines?**', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    const response = await route.fetch({ timeout: 45_000 }); expect(response.status()).toBe(201);
    const data = await response.json(); id = data.timeline.id; documents.set(id, data.timeline); await route.fulfill({ response });
  });
  await page.route('**/api/stories/timelines/*', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/create')) {
      const response = await route.fetch({ timeout: 45_000 }); expect(response.status()).toBe(201);
      const data = await response.json(); id = data.timeline.id; documents.set(id, data.timeline); await route.fulfill({ response }); return;
    }
    const key = path.split('/').at(-1)!, current = documents.get(key); if (!current) { await route.continue(); return; }
    if (route.request().method() === 'PUT') {
      saveRequests++;
      if (offlineWrites) { await route.abort('internetdisconnected'); return; }
      if (saveDelayMs) await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
      if (forceConflict) { forceConflict = false; documents.set(key, { ...current, name: 'Other tab', revision: current.revision + 1 }); await route.fulfill({ status: 409, json: { error: { message: 'Монтаж изменён в другом окне.' } } }); return; }
      const body = route.request().postDataJSON(); expect(body.expectedRevision).toBe(current.revision); documents.set(key, { ...current, ...body, revision: current.revision + 1 });
    }
    await route.fulfill({ json: { timeline: documents.get(key) } });
  });
  await page.route('**/api/stories/timelines/*/jobs**', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname, timeline = documents.get(id)!;
    if (path.endsWith('/jobs')) { const body = request.postDataJSON(); actions.push(body.action); if (body.action === 'plan') { expect(body.gridJobId).toBe(gridId); expect(body.bpm).toBeUndefined(); reviewedDuration = body.slots[0].durationMs; }
      await route.fulfill({ status: 202, json: { job: { id: body.action === 'rhythm' ? gridId : body.action === 'plan' ? planId : renderId } } }); return; }
    if (path.endsWith('/apply')) { documents.set(id, { ...timeline, revision: timeline.revision + 1, snapshot: { ...timeline.snapshot, clips: [{ id: randomUUID(), assetId: videoId, kind: 'video', sourceInMs: 0, durationMs: 3000, shotId: null }] } }); await route.fulfill({ json: { timeline: documents.get(id) } }); return; }
    const jobId = path.split('/').at(-1)!;
    const result = jobId === gridId ? { kind: 'grid', music, slots } : jobId === planId ? { kind: 'proposal', snapshot: { ...timeline.snapshot, clips: [{}] }, slots, reasons: [{ slotId: 'slot-0', reason: 'Спокойное вступление' }] } : { kind: 'render', assetId: randomUUID(), durationMs: 3000, frameRate: 30 };
    await route.fulfill({ json: { job: { id: jobId, status: 'succeeded' }, result, downloadUrl: jobId === renderId ? `/api/stories/timelines/${id}/jobs/${renderId}/download` : null } });
  });
  await page.route('**/api/timeline', async (route) => { expect(route.request().postDataJSON().documentId).toBeNull(); await route.fulfill({ json: { job: { id: sceneId, status: 'queued' } } }); });
  await page.route(`**/api/timeline/jobs/${sceneId}`, (route) => route.fulfill({ json: { job: { id: sceneId, status: 'succeeded' }, result: { version: 1, sourceAssetId: videoId, sourceChecksum: 'a'.repeat(64), durationMs: 3000, frameTimesMs: [0, 1000, 2000], shots: [0, 1000, 2000].map((startMs, index) => ({ id: `scene-${index}`, startMs, endMs: startMs + 1000, frames: [{ timeMs: startMs }], description: '' })) } } }));
  try {
    await page.goto('/');
    await page.getByRole('link', { name: 'Timeline Соберите последовательность' }).click({ timeout: 45_000 });
    await expect(page).toHaveURL(/create\?type=timeline/, { timeout: 45_000 });
    await expect(page.getByRole('button', { name: /Промо-ролик на основе трека/ })).toBeVisible();
    await page.screenshot({ path: '/tmp/timeline-presets-ui-qa.png', fullPage: true });
    await page.getByRole('button', { name: /Новый пустой таймлайн/ }).click();
    await expect(page.getByLabel('Редактор Timeline')).toBeVisible(); await dismiss(page, 'Закрыть ассистента');
    expect(new URL(page.url()).searchParams.has('document')).toBe(false); expect(documents.size).toBe(0);
    await expect(page.getByRole('complementary', { name: 'Навигация Production' })).toHaveCount(0);
    const back = page.getByRole('link', { name: 'Назад из таймлайна' });
    await expect(back).toHaveAttribute('href', '/create?type=timeline');
    await back.click();
    await expect(page.getByRole('complementary', { name: 'Навигация Production' })).toBeVisible();
    expect(documents.size).toBe(0);
    await page.goBack(); await expect(page.getByLabel('Редактор Timeline')).toBeVisible();
    const title = page.getByRole('textbox', { name: 'Название монтажа' });
    await title.fill('Timeline QA'); await synced(page);
    await expect(page).toHaveURL(/type=timeline.*[&]document=/, { timeout: 45_000 }); expect(documents.size).toBe(1);
    expect(documents.get(id)?.snapshot.production).toBeUndefined();
    const initialName = await title.inputValue();
    await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);
    saveDelayMs = 800; const before = saveRequests;
    await title.fill('First edit'); await expect.poll(() => saveRequests).toBeGreaterThan(before);
    await expect(title).toBeEnabled(); await title.fill('Second edit'); await synced(page);
    expect(documents.get(id)?.name).toBe('Second edit'); saveDelayMs = 0;
    offlineWrites = true; await title.fill('Offline edit');
    await expect.poll(() => page.evaluate((documentId) => Object.keys(localStorage).filter((key) => key.startsWith('timeline-autosave:v1:') && key.includes(documentId)).some((key) => JSON.parse(localStorage.getItem(key)!).draft.name === 'Offline edit'), id)).toBe(true);
    await expect(page.getByRole('button', { name: 'Повторить синхронизацию' })).toBeVisible();
    await page.reload(); await expect(title).toHaveValue('Offline edit');
    offlineWrites = false; await page.evaluate(() => window.dispatchEvent(new Event('online'))); await synced(page);
    expect(documents.get(id)?.name).toBe('Offline edit');
    forceConflict = true; await title.fill('Local conflict edit');
    await page.getByRole('button', { name: 'Сохранить мою версию' }).click(); await synced(page);
    expect(documents.get(id)?.name).toBe('Local conflict edit');
    await title.fill(initialName); await synced(page);
    const previewArea = page.getByRole('region', { name: 'Просмотр монтажа' });
    const initialWidth = (await previewArea.boundingBox())!.width;
    await page.getByRole('button', { name: 'Материалы', exact: true }).click();
    await page.getByRole('button', { name: 'Скрыть инструменты' }).click();
    expect((await previewArea.boundingBox())!.width).toBeGreaterThan(initialWidth + 400);
    await page.getByRole('button', { name: 'Материалы', exact: true }).click();
    await page.getByRole('button', { name: 'Свойства', exact: true }).click();
    const divider = page.getByRole('separator', { name: 'Высота монтажной области' });
    const tracks = page.getByRole('region', { name: 'Монтажная дорожка' });
    const initialHeight = (await tracks.boundingBox())!.height;
    await divider.press('ArrowUp'); expect((await tracks.boundingBox())!.height).toBeGreaterThan(initialHeight);
    await divider.dblclick();
    await page.getByRole('button', { name: 'Ассистент', exact: true }).click();
    await expect(page.locator('[data-assistant-window="docked"]')).toBeVisible();
    await page.getByRole('button', { name: 'Свойства', exact: true }).click();
    await expect(page.locator('[data-assistant-window="docked"]')).toHaveCount(1);
    await expect(page.locator('[data-assistant-window="docked"]')).toBeHidden();
    await checkTimelineLayout(page);
    await page.screenshot({ path: '/tmp/timeline-focused-empty.png', fullPage: true });
    await page.getByRole('button', { name: 'Выбрать Video QA.mp4', exact: true }).click(); await page.getByRole('button', { name: 'Найти сцены', exact: true }).click();
    await page.getByRole('button', { name: 'Добавить найденные сцены' }).click();
    await expect(page.getByRole('button', { name: /^Клип \d+,/ })).toHaveCount(3);
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2);
    await synced(page); expect(documents.get(id)?.snapshot.clips.map((c) => c.sourceInMs)).toEqual([0, 1000, 2000]);
    await checkTimelineControls(page);
    await page.getByRole('button', { name: 'Клип 3, 00:01.0', exact: true }).dragTo(page.getByRole('button', { name: 'Клип 1, 00:01.0', exact: true }));
    await synced(page); expect(documents.get(id)?.snapshot.clips[0].sourceInMs).toBe(2000);
    await page.getByRole('button', { name: 'Изменить длительность: Клип 1, 00:01.0', exact: true }).press('ArrowLeft');
    await synced(page); expect(documents.get(id)?.snapshot.clips[0].durationMs).toBe(900);
    await page.getByRole('button', { name: '+ Аудиодорожка', exact: true }).click();
    await page.getByRole('button', { name: 'Добавить Music QA.wav на таймлайн', exact: true }).click();
    await page.getByRole('button', { name: '+ Аудиодорожка', exact: true }).click();
    await page.getByRole('button', { name: 'Аудиоклип Music QA.wav', exact: true }).click();
    await page.getByRole('button', { name: 'Аудиодорожка', exact: true }).click(); await page.getByRole('option', { name: 'Аудио 2' }).click();
    await synced(page);
    expect(documents.get(id)?.snapshot.audioTracks).toHaveLength(2); expect(documents.get(id)?.snapshot.audioClips?.[0].trackId).toBe(documents.get(id)?.snapshot.audioTracks?.[1].id);
    await page.getByRole('button', { name: 'Поднять дорожку Аудио 2', exact: true }).click();
    await page.getByRole('button', { name: 'Отменить изменение', exact: true }).click(); await expect(page.getByRole('button', { name: 'Поднять дорожку Аудио 1', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Повторить изменение', exact: true }).click();
    await synced(page); expect(documents.get(id)?.snapshot.audioTracks?.[0].name).toBe('Аудио 2');
    await page.getByRole('button', { name: 'Убрать аудио с дорожки', exact: true }).click(); await synced(page);
    expect(documents.get(id)?.snapshot.audioClips).toHaveLength(0); expect(documents.get(id)?.snapshot.audioTracks).toHaveLength(2);
    await checkTimelineClipEditing(page, () => documents.get(id)!.snapshot);
    await page.goto('/create?type=timeline'); await page.getByRole('button', { name: /Промо-ролик на основе трека/ }).click();
    await expect(page.getByRole('heading', { name: 'Начнём с музыки' })).toBeVisible();
    expect(new URL(page.url()).searchParams.has('document')).toBe(false); expect(documents.size).toBe(1);
    await title.fill('Promo QA'); await synced(page);
    await expect(page).toHaveURL(/type=timeline.*[&]document=/, { timeout: 45_000 }); await dismiss(page, 'Закрыть ассистента'); expect(documents.get(id)?.snapshot.production?.targetDurationMs).toBe(30000);
    await page.getByRole('button', { name: 'Промо под трек', exact: true }).click();
    await page.getByRole('complementary', { name: 'Библиотека монтажа' }).getByLabel('Загрузить материалы с устройства').setInputFiles({ name: 'music.wav', mimeType: 'audio/wav', buffer: Buffer.from('QA mocked streamed upload') });
    await expect(page.getByRole('button', { name: 'Выбрать Uploaded music.wav', exact: true })).toBeVisible();
    const transfer = await page.evaluateHandle(() => { const value = new DataTransfer(); value.items.add(new File(['QA upload'], 'device.wav', { type: 'audio/wav' })); return value; });
    await page.getByRole('region', { name: 'Рабочее окно таймлайна', exact: true }).dispatchEvent('drop', { dataTransfer: transfer }); await transfer.dispose(); await expect.poll(() => uploads).toBe(2);
    await page.getByRole('complementary', { name: 'Инструменты монтажа' }).getByRole('button', { name: /Музыка из библиотеки/ }).click(); await page.getByRole('option', { name: 'Uploaded music.wav' }).click();
    await page.getByLabel('Video QA.mp4', { exact: true }).check();
    const ai = page.getByRole('button', { name: '2. Запустить AI-автомонтаж' }); await expect(ai).toBeDisabled();
    await page.getByLabel('BPM · пусто = определить', { exact: true }).fill('120'); await page.getByRole('button', { name: '1. Пересчитать ритм и ячейки' }).click();
    await expect.poll(() => actions).toEqual(['rhythm']); await expect(ai).toBeEnabled();
    await page.getByRole('button', { name: 'BPM ÷ 2' }).click(); await expect(ai).toBeDisabled(); await page.getByRole('button', { name: '1. Пересчитать ритм и ячейки' }).click(); await expect(ai).toBeEnabled();
    await page.getByRole('button', { name: 'Ячейка 1', exact: true }).click(); await page.getByLabel('Длительность ячейки, сек.', { exact: true }).fill('3.5'); await page.getByLabel('Длительность ячейки, сек.', { exact: true }).press('Tab');
    const boundary = await page.getByRole('button', { name: 'Изменить длительность: Ячейка 1', exact: true }).boundingBox(); expect(boundary).not.toBeNull();
    await page.mouse.move(boundary!.x + boundary!.width / 2, boundary!.y + boundary!.height / 2); await page.mouse.down(); await page.mouse.move(boundary!.x + boundary!.width / 2 + 18, boundary!.y + boundary!.height / 2); await page.mouse.up();
    await page.getByRole('button', { name: 'Промо под трек', exact: true }).click();
    await page.reload(); await dismiss(page, 'Закрыть ассистента'); await expect(ai).toBeEnabled();
    await ai.click(); await expect(page.getByRole('button', { name: 'Применить предложение' })).toBeEnabled(); expect(reviewedDuration).toBe(4000);
    await page.getByRole('button', { name: 'Применить предложение' }).click(); await page.getByRole('button', { name: 'Экспортировать', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /Экспортировать в CapCut/ })).toBeDisabled();
    await page.getByRole('menuitem', { name: /Экспортировать в MP4/ }).click();
    await expect.poll(() => actions.includes('render')).toBe(true);
    await page.getByRole('button', { name: 'Экспортировать', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /Скачать MP4/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Добавить выбранное аудио на дорожку' }).click(); await synced(page);
    await page.getByRole('button', { name: 'Экспортировать', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /Скачать MP4 Предыдущая версия монтажа/ })).toBeVisible();
    await page.screenshot({ path: '/tmp/timeline-export-menu.png', fullPage: true });
    const downloadEvent = page.waitForEvent('download'); await page.getByRole('menuitem', { name: /Экспортировать секвенцию/ }).click();
    const download = await downloadEvent; expect(download.suggestedFilename()).toMatch(/\.otio$/);
    const sequence = JSON.parse(await readFile((await download.path())!, 'utf8')); expect(sequence.OTIO_SCHEMA).toBe('Timeline.1'); expect(sequence.tracks.children.length).toBeGreaterThan(1);
    await page.getByRole('complementary', { name: 'Инструменты монтажа' }).evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: '/tmp/timeline-production-ui-qa.png', fullPage: true });
    await page.getByRole('button', { name: 'Ассистент', exact: true }).click();
    await page.screenshot({ path: '/tmp/timeline-focused-assistant.png', fullPage: true });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.screenshot({ path: '/tmp/timeline-focused-dark.png', fullPage: true, animations: 'disabled' });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.getByRole('button', { name: 'Настройки монтажа', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Пропорции' })).toBeVisible();
    await page.screenshot({ path: '/tmp/timeline-focused-settings.png', fullPage: true });
    await page.getByRole('button', { name: 'Настройки монтажа', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Свойства', exact: true }).click();
    expect((await previewArea.boundingBox())!.width).toBeLessThan(390);
    await page.getByRole('button', { name: 'Материалы', exact: true }).click();
    await page.getByRole('button', { name: 'Скрыть инструменты' }).click();
    expect((await previewArea.boundingBox())!.width).toBeGreaterThan(350);
    await expect(page.getByRole('button', { name: 'Экспортировать', exact: true })).toBeVisible();
    await page.screenshot({ path: '/tmp/timeline-focused-mobile.png', fullPage: true });
    await page.goto(`/stories/timelines/${id}`);
    await expect(page.getByLabel('Редактор Timeline')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Навигация Production' })).toHaveCount(0);
    await expect(back).toHaveAttribute('href', '/create?type=timeline');
    await back.click();
    await expect(page.getByRole('complementary', { name: 'Навигация Production' })).toBeVisible();
    await page.goto('/create?type=image');
    await expect(page.getByRole('complementary', { name: 'Навигация Production' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Вернуться к предыдущему экрану' }).click();
    await expect(page).toHaveURL(/create\?type=timeline$/);
    expect(errors).toEqual([]);
  } finally {
    const pool = new Pool({ connectionString: process.env.STORIES_TEST_DATABASE_URL });
    try { const record = (await pool.query('select created_by_user_id as id from workspace where id=$1 and name is not null', [owner.workspaceId])).rows[0];
      if (record) { await pool.query('delete from workspace where id=$1 and created_by_user_id=$2', [owner.workspaceId, record.id]); await pool.query('delete from "user" where id=$1 and name=$2', [record.id, 'Audio Runtime QA timeline-production']); }
    } finally { await pool.end(); }
  }
});
async function dismiss(page: Page, name: string) { const button = page.getByRole('button', { name, exact: true }); try { await button.waitFor({ state: 'visible', timeout: 2000 }); await button.click(); } catch { /* Optional onboarding and assistant. */ } }

async function previewVideo(page: Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 270;
    const context = canvas.getContext('2d')!, stream = canvas.captureStream(10), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks: Blob[] = []; recorder.ondataavailable = (event) => chunks.push(event.data);
    const finished = new Promise<number[]>((resolve) => { recorder.onstop = async () => resolve([...new Uint8Array(await new Blob(chunks).arrayBuffer())]); });
    recorder.start();
    let frame = 0; const timer = setInterval(() => { context.fillStyle = '#e8f4f0'; context.fillRect(0, 0, 480, 270); context.fillStyle = '#169b85'; context.beginPath(); context.arc(70 + (frame++ % 30) * 10, 135, 48, 0, Math.PI * 2); context.fill(); }, 100);
    await new Promise((resolve) => setTimeout(resolve, 4200)); clearInterval(timer); recorder.stop(); stream.getTracks().forEach((track) => track.stop()); return finished;
  });
  return Buffer.from(bytes);
}
function silentAudio() {
  const bytes = Buffer.alloc(44 + 8000 * 60 * 2); bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40); return bytes;
}

async function synced(page: Page) { await expect(page.getByRole('status', { name: 'Состояние сохранения' })).toHaveText('Сохранено'); }
