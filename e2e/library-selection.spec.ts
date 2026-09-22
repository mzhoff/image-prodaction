import { dismissSectionGuide, gotoQaSection } from './release-user-fixture';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL, trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

test('Library selection downloads originals/ZIP, confirms partial deletion and delivers a group with one Undo', async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'library-selection');
  await context.addCookies(owner.http.browserSessionCookies());
  const items = Array.from({ length: 5 }, (_, index) => {
    const id = `019a2345-0000-7000-8000-${String(index).padStart(12, '0')}`;
    return { id, workspaceId: owner.workspaceId, document: null, originalName: index < 2 ? 'photo.png' : `Photo ${index + 1}.png`,
      contentType: 'image/png', mediaKind: 'image', origin: 'uploaded', provider: null, modelId: null, operation: null,
      width: 600, height: 800, createdAt: '2026-09-12T10:00:00.000Z', byteSize: 1000,
      contentUrl: `/api/assets/${id}/content`, thumbnailUrl: `/api/assets/${id}/content?variant=thumbnail` };
  });
  const bytes = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#a3b9c9' } }).png().toBuffer();
  const before = createDefaultNode('textPrompt', { x: -500, y: 0 });
  const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [before], edges: [], assets: [] }, createEmptyProjectUiState());
  const document = { id: '019a2345-0000-7000-8000-000000000099', name: 'Library group QA', workspaceId: owner.workspaceId,
    revision: 1, schemaVersion: snapshot.schemaVersion, snapshot, favorite: false, hasEverHadContent: true,
    status: 'active', thumbnailAvailable: false, thumbnailMode: 'auto', thumbnailUrl: '' };
  let paidCalls = 0;
  let originalUploads = 0;
  const deleted: string[] = [];
  await page.route('**/api/ai/**', route => {
    if (route.request().method() === 'GET') return route.continue();
    paidCalls++; return route.abort();
  });
  // All tested files, deletions and documents are in-memory fixtures, never user assets.
  await page.route('**/api/assets?*', route => route.fulfill({ json: { items: items.filter(item => !deleted.includes(item.id)), nextCursor: null, facets: {} } }));
  await page.route('**/api/assets/**', route => {
    const url = new URL(route.request().url());
    const item = items.find(item => url.pathname.startsWith(`/api/assets/${item.id}`));
    if (route.request().method() === 'POST') { originalUploads++; return route.abort(); }
    if (!item) return route.continue();
    if (route.request().method() === 'DELETE') {
      if (item.id === items[1].id) return route.fulfill({ status: 403, json: { error: 'Fixture deletion denied' } });
      deleted.push(item.id); return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname.endsWith('/content')) return route.fulfill({ contentType: 'image/png', body: bytes });
    return route.fulfill({ json: { asset: { ...item, status: 'ready', libraryVisible: true } } });
  });
  await page.route('**/api/projects', route => route.request().method() === 'GET' ? route.fulfill({ json: { projects: [document] } }) : route.abort());
  await page.route(`**/api/projects/${document.id}/thumbnail`, route => route.fulfill({ json: { project: document } }));
  await page.route(`**/api/projects/${document.id}`, route => {
    if (route.request().method() === 'PATCH') { document.snapshot = route.request().postDataJSON().snapshot; document.revision++; }
    return route.fulfill({ json: { project: document } });
  });
  const cards = page.locator('.library-card');
  const menu = page.locator('.context-menu');
  const selection = page.getByRole('group', { name: 'Выбор файлов' });
  try {
    await gotoQaSection(page, '/library');
    await expect(cards).toHaveCount(5);
    await cards.first().click({ button: 'right' });
    await expect(menu.getByRole('button', { name: 'Скопировать ссылку', exact: true })).toBeEnabled();
    const singleDownload = page.waitForEvent('download');
    await menu.getByRole('button', { name: 'Скачать', exact: true }).click();
    const single = await singleDownload;
    expect(single.suggestedFilename()).toBe('photo.png');
    expect(await readFile((await single.path())!)).toEqual(bytes);
    await cards.first().click({ button: 'right' });
    await menu.getByRole('button', { name: 'Выбрать', exact: true }).click();
    await expect(cards.getByRole('checkbox')).toHaveCount(5);
    await expect(cards.first().getByRole('checkbox')).toBeChecked();
    await cards.nth(1).locator('a').click();
    await expect(page).toHaveURL(`${origin.origin}/library`);
    await expect(selection).toContainText('Выбрано: 2');
    const searchLibrary = async (query: string) => {
      await page.getByRole('button', { name: 'Поиск по библиотеке', exact: true }).click();
      const search = page.getByRole('dialog', { name: 'Поиск в Workspace' });
      await search.getByRole('searchbox', { name: 'Найти файлы в Workspace' }).fill(query);
      await search.getByRole('button', { name: 'Фильтры', exact: true }).click();
      await search.getByRole('button', { name: 'Показать в библиотеке', exact: true }).click();
      await expect(search).toHaveCount(0);
    };
    await searchLibrary('photo');
    await expect(selection).toHaveCount(0);
    await searchLibrary('');
    await expect(selection).toHaveCount(0);
    await expect(cards.getByRole('checkbox')).toHaveCount(0);
    await cards.first().click({ button: 'right' });
    await menu.getByRole('button', { name: 'Выбрать', exact: true }).click();
    await cards.nth(1).getByRole('checkbox').check();
    await cards.first().click({ button: 'right' });
    await expect(menu.getByRole('button', { name: 'Скопировать ссылку', exact: true })).toBeDisabled();
    await expect(menu.getByRole('button', { name: 'Добавить в проект', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('library-group-menu.png') });
    const zipDownload = page.waitForEvent('download');
    await menu.getByRole('button', { name: 'Скачать', exact: true }).click();
    const zip = await zipDownload;
    expect(zip.suggestedFilename()).toMatch(/\.zip$/);
    const archive = await readFile((await zip.path())!);
    expect(archive.readUInt32LE()).toBe(0x04034b50);
    expect(archive.includes(Buffer.from('photo (2).png'))).toBe(true);
    expect(archive.readUInt16LE(archive.length - 12)).toBe(2);
    await selection.getByRole('button', { name: 'Действия', exact: true }).click();
    await menu.getByRole('button', { name: 'Удалить', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Удалить файлы (2)?', exact: true });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('безвозвратно');
    await expect(confirmation.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('library-delete-confirmation.png') });
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0); expect(deleted).toHaveLength(0);
    await selection.getByRole('button', { name: 'Действия', exact: true }).click();
    await menu.getByRole('button', { name: 'Удалить', exact: true }).click();
    await confirmation.getByRole('button', { name: 'Удалить безвозвратно', exact: true }).click();
    await expect(cards).toHaveCount(4); expect(deleted).toEqual([items[0].id]);
    await expect(selection).toContainText('Выбрано: 1');
    await expect(cards.first().getByRole('checkbox')).toBeChecked();
    await expect(page.locator('.library-action-message')).toContainText('Не удалось удалить: 1');

    await selection.getByRole('button', { name: 'Выбрать все загруженные' }).click();
    await expect(cards.locator('input:checked')).toHaveCount(4);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => {
      const box = await selection.boundingBox();
      return Boolean(box && box.x >= 0 && box.x + box.width <= 390);
    }).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('library-selection-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await selection.getByRole('button', { name: 'Действия', exact: true }).click();
    await menu.getByRole('button', { name: 'Добавить в проект', exact: true }).click();
    await page.getByRole('region', { name: 'Отправить в проект' }).getByRole('menuitem', { name: document.name }).click();
    await expect(page).toHaveURL(`${origin.origin}/projects/${document.id}`);
    await dismissSectionGuide(page, 'canvas');
    const imports = page.locator('.production-node-importImage');
    await expect(imports).toHaveCount(4);
    await expect.poll(() => document.snapshot.project.nodes.length).toBe(5);
    expect(document.snapshot.project.assets).toHaveLength(4);
    await page.locator('.production-canvas').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(imports).toHaveCount(0);
    await expect(page.locator(`[data-node-id="${before.id}"]`)).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(imports).toHaveCount(4);
    await expect.poll(() => document.snapshot.project.nodes.length).toBe(5);
    await page.reload(); await expect(imports).toHaveCount(4);
    expect(paidCalls).toBe(0); expect(originalUploads).toBe(0);
  } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
});
