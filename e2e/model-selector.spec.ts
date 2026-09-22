import { gotoQaSection } from './release-user-fixture';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import type { ProductionNodeType } from '../src/entities/production-graph/model/types';
import type { AccountModelPreferences } from '../src/shared/model-preferences/contracts';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1200 } });
test('account model lists persist across nodes/reloads, settings reorder favorites, and accounts stay isolated', async ({ page, context, baseURL }) => {
  test.setTimeout(150_000);
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'model-preferences');
  const other = await createAudioQaOwner(origin.origin, 'model-preferences-isolation');
  await context.addCookies(owner.http.browserSessionCookies());
  const read = async (http = owner.http) => {
    const response = await http.request('/api/account/model-preferences'); expect(response.status).toBe(200);
    return await response.json() as AccountModelPreferences;
  };
  const before = await read();
  expect(Object.values(before.preferences).map((p) => p.tab)).toEqual(['all', 'all', 'all', 'all']);
  const documents = ['generateImage', 'generateImage', 'generateVideo', 'textGeneration', 'textToSpeech'].map((type) => {
    const node = createDefaultNode(type as ProductionNodeType, { x: 160, y: 35 });
    const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [node], edges: [], assets: [] }, createEmptyProjectUiState());
    return { nodeId: node.id, id: randomUUID(), name: 'QA Model Selector', workspaceId: owner.workspaceId, revision: 1,
      schemaVersion: snapshot.schemaVersion, snapshot, favorite: false, hasEverHadContent: true,
      status: 'active', thumbnailAvailable: false, thumbnailMode: 'auto', thumbnailUrl: '' };
  });
  // Controlled usage counts exercise the popular UI without creating or running a paid job.
  // Account preference reads/writes use the real API; SQL aggregation has a separate PostgreSQL test.
  await page.route('**/api/account/model-preferences', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(); const data = await response.json() as AccountModelPreferences;
    data.popularity.image = { 'google/gemini-2.5-flash-image': 3, 'openai/gpt-5-image': 7 };
    return route.fulfill({ response, json: data });
  });
  let paidCalls = 0;
  await page.route('**/api/ai/**', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    paidCalls++; return route.abort();
  });
  for (const document of documents) {
    await page.route(`**/api/projects/${document.id}/thumbnail`, (route) => route.fulfill({ json: { project: document } }));
    await page.route(`**/api/projects/${document.id}`, (route) => {
      if (route.request().method() === 'PATCH') { document.snapshot = route.request().postDataJSON().snapshot; document.revision++; }
      return route.fulfill({ json: { project: document } });
    });
  }
  const open = async (index: number) => {
    const document = documents[index]; await gotoQaSection(page, `/projects/${document.id}`);
    const node = page.locator(`[data-node-id="${document.nodeId}"]`).first();
    const trigger = index < 2 ? node.getByRole('button', { name: 'Image model', exact: true })
      : node.locator('.setting-row').filter({ has: page.locator(':scope > span').filter({ hasText: /^Model$/ }) }).getByRole('button').first();
    await trigger.click(); const dialog = page.getByRole('dialog', { name: index < 2 ? 'Image model' : 'Model', exact: true });
    await expect(dialog.getByRole('tab', { name: 'All', exact: true })).toBeEnabled();
    return dialog;
  };
  let dialog = await open(0);
  const choices = dialog.locator('[data-model-choice]');
  await expect(choices).not.toHaveCount(0);
  const labels = await choices.locator('.dark-select-option-content > span:last-child').allTextContents();
  expect(labels).toEqual([...labels].sort(new Intl.Collator('en', { sensitivity: 'base', numeric: false }).compare));
  expect(labels.some((label) => /Auto Router/i.test(label))).toBe(false);
  const first = 'Nano Banana', second = 'GPT Image';
  const favorite = (label: string) => dialog.getByRole('button', { name: `Добавить в избранное: ${label}`, exact: true });
  await choices.filter({ hasText: /^Nano Banana$/ }).hover(); await favorite(first).click();
  await expect(dialog.getByRole('button', { name: `Удалить из избранного: ${first}`, exact: true })).toBeEnabled();
  await dialog.getByRole('tab', { name: 'Most popular', exact: true }).click();
  await expect(choices).toHaveText([second, first]);
  await choices.filter({ hasText: /^GPT Image$/ }).hover(); await favorite(second).click();
  await expect(dialog.getByRole('button', { name: `Удалить из избранного: ${second}`, exact: true })).toBeEnabled();
  await dialog.getByRole('tab', { name: 'Favorite', exact: true }).click();
  await expect(choices).toHaveText([first, second]);
  await expect.poll(async () => (await read()).preferences.image.tab).toBe('favorites');
  // Star clicks did not select a model or close the menu.
  expect(documents[0].snapshot.project.nodes[0].data).toMatchObject({ model: 'google/gemini-2.5-flash-image' });
  dialog = await open(1);
  await expect(dialog.getByRole('tab', { name: 'Favorite', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.locator('[data-model-choice]')).toHaveText([first, second]);
  await dialog.getByRole('textbox', { name: 'Найти модель', exact: true }).fill('gpt');
  await expect(dialog.locator('[data-model-choice]')).toHaveText([second]);
  await dialog.getByRole('button', { name: 'Очистить поиск' }).click();
  await expect(dialog.locator('[data-model-choice]')).toHaveText([first, second]);
  if (process.env.MODEL_SELECTOR_SCREENSHOT) await page.screenshot({ path: process.env.MODEL_SELECTOR_SCREENSHOT });
  await dialog.getByRole('textbox', { name: 'Найти модель', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('button', { name: first, exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('button', { name: second, exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: `Удалить из избранного: ${second}`, exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog).not.toBeVisible();
  dialog = await open(2); await expect(dialog.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('tab', { name: 'Most popular', exact: true }).click();
  await expect(dialog.getByText('Пока нет успешных запусков доступных здесь моделей.')).toBeVisible();
  await expect.poll(async () => (await read()).preferences.video.tab).toBe('popular');
  dialog = await open(3); await expect(dialog.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('tab', { name: 'Favorite', exact: true }).click();
  await expect.poll(async () => (await read()).preferences.text.tab).toBe('favorites');
  dialog = await open(4); await expect(dialog.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('tab', { name: 'Favorite', exact: true }).click();
  await expect.poll(async () => (await read()).preferences.audio.tab).toBe('favorites');
  await gotoQaSection(page, '/settings/account');
  const settings = page.getByRole('region', { name: 'Избранные модели', exact: true });
  await settings.getByRole('tab', { name: 'Изображения', exact: true }).click();
  const ordered = settings.getByRole('list', { name: 'Порядок избранных моделей' });
  await expect(ordered.locator('li .dark-select-option-content')).toHaveText([first, second]);
  await ordered.getByRole('button', { name: `Выше: ${second}`, exact: true }).click();
  await expect(ordered.locator('li .dark-select-option-content')).toHaveText([second, first]);
  await expect(ordered.getByRole('button', { name: `Ниже: ${second}`, exact: true })).toBeEnabled();
  if (process.env.MODEL_SETTINGS_SCREENSHOT) await settings.screenshot({ path: process.env.MODEL_SETTINGS_SCREENSHOT });
  dialog = await open(0); await expect(dialog.locator('[data-model-choice]')).toHaveText([second, first]);
  await dialog.getByRole('button', { name: `Удалить из избранного: ${second}`, exact: true }).click();
  await expect(dialog.locator('[data-model-choice]')).toHaveText([first]);
  await expect.poll(async () => (await read()).preferences.image.favorites).toEqual(['google/gemini-2.5-flash-image']);
  await page.reload();
  await page.getByRole('button', { name: 'Image model', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Favorite', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-model-choice]')).toHaveText([first]);
  const foreign = await read(other.http);
  expect(foreign.accountId).not.toBe(before.accountId);
  expect(Object.values(foreign.preferences).every((p) => p.tab === 'all' && p.favorites.length === 0)).toBe(true);
  const invalid = await owner.http.request('/api/account/model-preferences', { method: 'PATCH', json: { modality: 'image', action: 'tab', tab: 'all', userId: foreign.accountId } });
  expect(invalid.status).toBe(400);
  const auto = await owner.http.request('/api/account/model-preferences', { method: 'PATCH', json: { modality: 'image', action: 'favorite', modelId: 'openrouter/auto', favorite: true } });
  expect(auto.status).toBe(400);
  const switchedAccountStatus = await page.evaluate(async (accountId) => (await fetch('/api/account/model-preferences', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
    body: JSON.stringify({ modality: 'image', action: 'tab', tab: 'all' }),
  })).status, foreign.accountId);
  expect(switchedAccountStatus).toBe(409);
  expect(paidCalls).toBe(0);
});
