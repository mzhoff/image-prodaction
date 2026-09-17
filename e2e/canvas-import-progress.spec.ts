import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

async function dropFiles(page: Page, bytes: Buffer, count: number, heic = false) {
  const transfer = await page.evaluateHandle(({ data, count, heic }) => {
    const transfer = new DataTransfer();
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    for (let i = 0; i < count; i++) transfer.items.add(new File([bytes], `IMG_${i}.${heic ? 'HEIC' : 'png'}`, { type: heic ? 'image/heic' : 'image/png' }));
    return transfer;
  }, { data: bytes.toString('base64'), count, heic });
  await page.locator('.production-canvas').dispatchEvent('drop', { dataTransfer: transfer, clientX: 900, clientY: 150 });
  await transfer.dispose();
}

test('42-file drop shows live progress, preserves successes, and finishes as one undoable action', async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const apiOrigin = new URL(process.env.CANVAS_IMPORT_API_URL ?? origin.origin);
  if (apiOrigin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(apiOrigin.hostname)) throw new Error('Local-only QA API');
  const owner = await createAudioQaOwner(apiOrigin.origin, 'canvas-import');
  await context.addCookies(owner.http.browserSessionCookies().map((cookie) => ({ ...cookie, url: origin.origin })));
  const created = await owner.http.request('/api/projects', { json: { name: 'QA Canvas import progress', workspaceId: owner.workspaceId } });
  expect(created.status).toBe(201);
  const document = (await created.json()).project;
  const prompt = createDefaultNode('textPrompt', { x: 0, y: 0 });
  const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [prompt], edges: [], assets: [] }, createEmptyProjectUiState());
  expect((await owner.http.request(`/api/projects/${document.id}`, { method: 'PATCH', json: { expectedRevision: document.revision, snapshot } })).status).toBe(200);
  await page.route('**/api/ai/**', (route) => route.request().method() === 'GET' ? route.continue() : route.abort());
  const png = await sharp({ create: { width: 256, height: 384, channels: 3, background: '#367e8c' } }).png().toBuffer();
  const heicPath = process.env.CANVAS_IMPORT_HEIC_FIXTURE;
  const bytes = heicPath ? await readFile(heicPath) : png;
  let releaseFirst!: () => void;
  let releaseMiddle!: () => void;
  const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const middle = new Promise<void>((resolve) => { releaseMiddle = resolve; });
  let requests = 0;
  await page.route('**/api/assets/images', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const index = ++requests;
    if (index === 1) await first;
    if (index === 25) await middle;
    if (index === 9) return route.fulfill({ status: 400, json: { error: { message: 'QA: файл повреждён' } } });
    await route.continue();
  });
  const card = page.getByRole('region', { name: 'Импорт файлов', exact: true });
  const bar = page.getByRole('progressbar', { name: 'Обработано файлов' });
  try {
    await page.goto(`/projects/${document.id}`);
    await expect(page.locator('.production-node-textPrompt')).toHaveCount(1);
    // Record transient conversion text even on small HEIC files that decode quickly.
    await page.evaluate(() => {
      const stages: string[] = [];
      Object.assign(window, { importQaStages: stages });
      new MutationObserver(() => {
        const text = document.querySelector('.canvas-import-progress')?.textContent;
        if (text && stages.at(-1) !== text) stages.push(text);
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await dropFiles(page, bytes, 42, Boolean(heicPath));
    await expect(card).toBeVisible();
    await expect(card).toContainText('Загружаем изображения');
    await expect(bar).toHaveAttribute('value', '0');
    await expect(bar).toHaveAttribute('max', '42');
    await expect.poll(() => requests).toBe(1);
    await expect(card).toContainText('Загружаем файл');
    const cardBox = (await card.boundingBox())!;
    const toolbarBox = (await page.locator('.canvas-toolbar').boundingBox())!;
    expect(cardBox.y + cardBox.height).toBeLessThan(toolbarBox.y);
    await page.screenshot({ path: testInfo.outputPath('import-start.png') });
    await dropFiles(page, png, 1);
    await expect(page.locator('.canvas-toast')).toContainText('Импорт уже идёт');
    expect(requests).toBe(1);
    releaseFirst();
    await expect.poll(() => requests, { timeout: 90_000 }).toBe(25);
    await expect(bar).toHaveAttribute('value', '24');
    await expect(card).toContainText('Не удалось загрузить: 1');
    await page.screenshot({ path: testInfo.outputPath('import-progress-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileBox = (await card.boundingBox())!;
    expect(mobileBox.x).toBeGreaterThanOrEqual(0);
    expect(mobileBox.x + mobileBox.width).toBeLessThanOrEqual(390);
    expect(mobileBox.y + mobileBox.height).toBeLessThan((await page.locator('.canvas-toolbar').boundingBox())!.y);
    await page.screenshot({ path: testInfo.outputPath('import-progress-mobile.png') });
    releaseMiddle();
    await expect(card).toContainText('Добавлено: 41 из 42 · Не удалось: 1', { timeout: 90_000 });
    await expect(page.locator('.production-node-importImage')).toHaveCount(41);
    expect(requests).toBe(42);
    if (heicPath) expect(await page.evaluate(() => (window as unknown as { importQaStages: string[] }).importQaStages.some((text) => text.includes('Конвертируем HEIC в JPEG')))).toBe(true);
    await card.getByRole('button', { name: 'Закрыть статус импорта' }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.production-node-importImage')).toHaveCount(0);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('.production-node-importImage')).toHaveCount(41);
    await dropFiles(page, png, 1);
    await expect(card).toContainText('Добавлено: 1 из 1');
    await expect(card).toBeHidden({ timeout: 8000 });
  } finally {
    releaseFirst(); releaseMiddle();
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});
