import { gotoQaSection } from './release-user-fixture';
import { expect, test } from '@playwright/test';
import { createAudioQaOwner } from './audio-runtime-fixtures';
import { openAccountPreferences, selectTheme } from './theme-control-fixture';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';

test.use({ channel: 'chrome', locale: 'ru-RU', trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

test('Shared Reverie theme: persistence, forms, menus, canvas and content isolation', async ({ page, context, baseURL }, info) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  const authOrigin = new URL(process.env.REVERIE_QA_AUTH_ORIGIN ?? origin.origin);
  for (const url of [origin, authOrigin]) {
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local-only UI QA');
  }
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let paid = 0;
  await page.route('**/api/ai/**', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    paid++; return route.abort();
  });
  await page.route('**/api/chat/v1/turn**', (route) => { paid++; return route.abort(); });
  await page.route('**/api/chat/v1/config', (route) => route.fulfill({ json: {
    enabled: true, missingSettings: [], mode: 'knowledge-base', model: 'openai/gpt-5.4-nano',
  } }));
  await page.route('**/api/product-chat/documents/*/conversation', (route) => route.fulfill({ json: {} }));
  await context.addCookies([{ name: 'pui-theme', value: 'dark', url: origin.origin }]);
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.auth-page')).toHaveCSS('background-color', 'rgb(24, 24, 27)');
  await expect(page.locator('input[type=email]')).toHaveClass(/pui-input/);
  await page.screenshot({ path: info.outputPath('reverie-login-dark.png') });

  const owner = await createAudioQaOwner(authOrigin.origin, 'reverie-theme');
  await context.addCookies(owner.http.browserSessionCookies());
  const created = await owner.http.request('/api/projects', { json: { workspaceId: owner.workspaceId, name: 'Reverie theme QA' } });
  expect(created.status).toBe(201);
  const { project } = await created.json();
  const nodes = [
    createDefaultNode('textPrompt', { x: 0, y: 0 }),
    createDefaultNode('generateImage', { x: 410, y: 0 }),
    createDefaultNode('audioConvert', { x: 820, y: 0 }),
  ];
  nodes[0]!.data = { ...nodes[0]!.data, text: '[ACTORS]\nТекст остаётся прежним при смене темы.' };
  const snapshot = createProjectExport({ ...initialProject, nodes }, createEmptyProjectUiState());
  const patched = await owner.http.request(`/api/projects/${project.id}`, { method: 'PATCH', json: { snapshot, expectedRevision: project.revision } });
  expect(patched.status).toBe(200);

  const assetId = '019a3456-0000-7000-8000-000000000007';
  await page.route('**/api/assets?*', (route) => route.fulfill({ json: {
    items: [{ id: assetId, workspaceId: owner.workspaceId, document: { id: project.id, name: project.name, status: 'active' },
      originalName: 'theme-qa.svg', contentType: 'image/png', mediaKind: 'image', origin: 'uploaded', provider: null,
      modelId: null, operation: 'upload', width: 800, height: 600, byteSize: 1024, createdAt: '2026-09-10T10:00:00Z',
      contentUrl: `/api/assets/${assetId}/content`, thumbnailUrl: `/api/assets/${assetId}/content?variant=thumbnail` }],
    nextCursor: null, facets: { origins: [], models: [], documents: [], mediaKinds: [] },
  } }));
  await page.route(`**/api/assets/${assetId}/content*`, (route) => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#2b4670"/><circle cx="400" cy="300" r="180" fill="#fc9"/></svg>',
  }));

  await gotoQaSection(page, '/library');
  // A new account imports the theme chosen in its completed questionnaire.
  await expect(page.locator('html')).toHaveAttribute('data-pui-preference', 'light');
  await selectTheme(page, 'dark');
  const theme = page.getByRole('combobox', { name: 'Тема оформления' });
  await expect(theme).toHaveCount(0);
  await expect(page.locator('.workspace-sidebar')).toHaveCSS('color', 'rgb(250, 250, 250)');
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByRole('combobox', { name: 'Источник', exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveClass(/production-filter-menu/);
  await page.screenshot({ path: info.outputPath('reverie-library-dark.png') });
  await page.keyboard.press('Escape');
  const card = page.locator('.library-card').first();
  await card.hover();
  await expect(card.locator('.library-card-details')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await card.locator('a').click();
  await expect(page.getByRole('dialog', { name: 'Image viewer', exact: true })).toBeVisible();
  const photo = page.locator('.image-viewer-carousel-card .image-viewer-media');
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('reverie-photo-viewer-dark.png') });
  await page.getByRole('button', { name: 'Отправить в проект' }).click();
  await expect(page.locator('.library-project-menu')).toBeVisible();
  await page.screenshot({ path: info.outputPath('reverie-photo-menu-dark.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close image viewer', exact: true }).last().click();
  await selectTheme(page, 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  const account = await openAccountPreferences(page);
  await expect(account.getByRole('button', { name: 'Светлая', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await account.getByRole('button', { name: 'Закрыть аккаунт', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: info.outputPath('reverie-library-light.png') });
  await selectTheme(page, 'system');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await selectTheme(page, 'dark');

  await gotoQaSection(page, '/settings/account');
  await expect(theme).toHaveCount(1);
  await selectTheme(page, 'light');
  await expect(theme).toHaveText('Светлая');
  await selectTheme(page, 'dark');
  await expect(page.locator('.settings-section input[name=name]')).toHaveClass(/pui-input/);
  await page.screenshot({ path: info.outputPath('reverie-settings-dark.png') });
  await gotoQaSection(page, `/projects/${project.id}`);
  await expect(page.locator('.production-node')).toHaveCount(3);
  await expect(page.locator('.production-node').first()).toHaveCSS('background-color', 'rgb(24, 24, 27)');
  await expect.poll(() => page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return ['text', 'image', 'audio', 'video'].map((kind) => root.getPropertyValue(`--pui-semantic-dataflow-${kind}`).trim().toLowerCase());
  })).toEqual(['#4ade80', '#60a5fa', '#e879f9', '#fb923c']);
  await expect(page.locator('.primary-node-button').first()).toHaveClass(/pui-button/);
  await expect(page.locator('.production-node-generateImage textarea')).toHaveClass(/pui-textarea-control/);
  await page.getByRole('button', { name: 'Zoom to fit', exact: true }).click();
  const triggerBox = (await theme.boundingBox())!;
  // Inline flex is blockified to flex as a toolbar flex item.
  await expect(theme).toHaveCSS('display', 'flex');
  const chevronBox = (await theme.locator('.pui-select__trigger-icon').boundingBox())!;
  expect(chevronBox.x + chevronBox.width).toBeLessThanOrEqual(triggerBox.x + triggerBox.width);
  expect(Math.abs(chevronBox.y + chevronBox.height / 2 - triggerBox.y - triggerBox.height / 2)).toBeLessThanOrEqual(1);
  await theme.click();
  const menuBox = (await page.getByRole('listbox').boundingBox())!;
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(triggerBox.y);
  await page.screenshot({ path: info.outputPath('reverie-canvas-theme-menu.png') });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: info.outputPath('reverie-canvas-dark.png') });
  await page.getByRole('button', { name: /Открыть ассистента/ }).click();
  await expect(page.locator('.image-production-chat')).toBeVisible();
  await expect(page.locator('.assistant-shell')).toHaveCSS('opacity', '1');
  await expect(page.locator('.assistant-shell')).toHaveCSS('transform', 'none');
  await page.screenshot({ path: info.outputPath('reverie-assistant-dark.png') });
  await expect(page.locator('.image-production-chat')).toHaveCSS('color', 'rgb(250, 250, 250)');
  await page.getByRole('button', { name: 'Закрыть ассистента', exact: true }).click();
  await expect(page.locator('.assistant-shell')).toHaveCSS('opacity', '0');
  await selectTheme(page, 'light');
  await expect(page.locator('.production-node').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.production-node-textPrompt [contenteditable=true]')).toContainText('Текст остаётся прежним при смене темы.');
  await page.screenshot({ path: info.outputPath('reverie-canvas-light.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('combobox', { name: 'Тема оформления' })).toBeVisible();
  await theme.click();
  const phoneMenu = (await page.getByRole('listbox').boundingBox())!;
  expect(phoneMenu.x).toBeGreaterThanOrEqual(0);
  expect(phoneMenu.x + phoneMenu.width).toBeLessThanOrEqual(390);
  expect(phoneMenu.y).toBeGreaterThanOrEqual(0);
  expect(phoneMenu.y + phoneMenu.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: info.outputPath('reverie-canvas-phone-theme-menu.png') });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('reverie-canvas-phone.png') });
  expect(paid).toBe(0);
  expect(errors).toEqual([]);
});

test('a new account imports its own appearance after the previous account signs out', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  const authOrigin = new URL(process.env.REVERIE_QA_AUTH_ORIGIN ?? origin.origin);
  const first = await createAudioQaOwner(authOrigin.origin, 'theme-first-account');
  await context.addCookies(first.http.browserSessionCookies());
  await gotoQaSection(page, '/library');
  await expect(page.getByRole('button', { name: 'Аккаунт: Audio Runtime QA theme-first-account', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-pui-preference', 'light');
  await selectTheme(page, 'dark');
  const account = await openAccountPreferences(page);
  await account.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.locator('html')).toHaveAttribute('data-pui-preference', 'dark');

  // Transfer a separately verified fixture session, keeping the same browser
  // preferences. The product must hydrate the incoming account's questionnaire.
  const second = await createAudioQaOwner(authOrigin.origin, 'theme-second-account');
  expect(second.workspaceId).not.toBe(first.workspaceId);
  await context.addCookies(second.http.browserSessionCookies());
  const secondPage = await context.newPage();
  await gotoQaSection(secondPage, '/library');
  await expect(secondPage.getByRole('button', { name: 'Аккаунт: Audio Runtime QA theme-second-account', exact: true })).toBeVisible();
  await expect(secondPage.getByRole('button', { name: 'Аккаунт: Audio Runtime QA theme-first-account', exact: true })).toHaveCount(0);
  await expect(secondPage.locator('html')).toHaveAttribute('data-pui-preference', 'light');
  const secondAccount = await openAccountPreferences(secondPage);
  await expect(secondAccount.getByRole('button', { name: 'Светлая', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await secondAccount.getByRole('button', { name: 'Закрыть аккаунт', exact: true }).click();
  await secondPage.reload();
  await expect(secondPage.locator('html')).toHaveAttribute('data-pui-preference', 'light');
  await secondPage.close();
});
