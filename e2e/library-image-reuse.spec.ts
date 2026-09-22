import { gotoQaSection } from './release-user-fixture';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import { awaitQaAssetIngest, audioQaForm, createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });
const key = 'reverie-image-production-project:v1';
const nodeCount = (page: Page) => page.locator('.production-canvas article[data-node-id]').count();
async function focusCanvas(page: Page) {
  await page.locator('.production-canvas').focus();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
}

test('Library viewer, system clipboard, grid actions and project delivery reuse the original', async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(150_000);
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'library-reuse');
  await context.addCookies(owner.http.browserSessionCookies());
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  let paidRequests = 0;
  await page.route('**/api/ai/**', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    paidRequests++; return route.abort();
  });
  const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#6754ac' } }).png().toBuffer();
  const upload = await owner.http.request('/api/assets/images', { form: audioQaForm(bytes, owner.workspaceId, true) });
  const { asset } = await awaitQaAssetIngest(owner.http, upload);
  const secondBytes = await sharp({ create: { width: 900, height: 1600, channels: 3, background: '#339c91' } }).png().toBuffer();
  const secondUpload = await owner.http.request('/api/assets/images', { form: audioQaForm(secondBytes, owner.workspaceId, true) });
  const { asset: secondAsset } = await awaitQaAssetIngest(owner.http, secondUpload);
  const link = `${origin.origin}/api/assets/${asset.id}/content`;
  const targets: string[] = [];
  for (const name of ['Library QA — existing board', 'Library QA — send target']) {
    const created = await owner.http.request('/api/projects', { json: { name, workspaceId: owner.workspaceId } });
    expect(created.status).toBe(201);
    const project = (await created.json()).project;
    targets.push(project.id);
    const prompt = createDefaultNode('textPrompt', { x: 20, y: 30 });
    prompt.id = 'existing-prompt'; prompt.data = { ...prompt.data, text: 'Keep this existing text.' };
    const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [prompt], edges: [], assets: [] }, createEmptyProjectUiState());
    expect((await owner.http.request(`/api/projects/${project.id}`, { method: 'PATCH', json: { expectedRevision: project.revision, snapshot } })).status).toBe(200);
  }
  const imports = () => page.locator('.production-node-importImage');
  try {
    await page.goto(`/library/${asset.id}`);
    const toolbar = page.getByRole('group', { name: 'Действия с изображением' });
    await expect(toolbar).toBeVisible();
    const mediaBox = await page.locator('.image-viewer-media').boundingBox();
    const toolbarBox = await toolbar.boundingBox();
    expect(toolbarBox!.y).toBeGreaterThanOrEqual(mediaBox!.y + mediaBox!.height - 2);
    expect(toolbarBox!.y + toolbarBox!.height).toBeLessThanOrEqual(1000);
    await page.screenshot({ path: testInfo.outputPath('library-actions.png') });
    await page.setViewportSize({ width: 375, height: 812 });
    for (const button of await toolbar.getByRole('button').all()) {
      await expect.poll(async () => {
        const box = await button.boundingBox();
        return Boolean(box && box.x >= 0 && box.x + box.width <= 375 && box.y + box.height <= 812);
      }).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Next generated image' }).click();
    await expect(page).toHaveURL(`${origin.origin}/library/${secondAsset.id}`);
    await expect(page.getByRole('dialog', { name: 'Image viewer', exact: true })).toHaveCount(1);
    await toolbar.getByRole('button', { name: 'Скопировать ссылку' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin.origin}/api/assets/${secondAsset.id}/content`);
    await page.getByRole('button', { name: 'Previous generated image' }).click();
    await expect(page).toHaveURL(`${origin.origin}/library/${asset.id}`);
    await toolbar.getByRole('button', { name: 'Скопировать ссылку' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Ссылка скопирована' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

    // The anchored picker owns keyboard input without making the viewer modal/inert.
    await toolbar.getByRole('button', { name: 'Отправить в проект' }).click();
    const projectMenu = page.getByRole('region', { name: 'Отправить в проект' });
    await expect(projectMenu).toBeVisible();
    await expect(projectMenu.getByRole('searchbox')).toBeFocused();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(projectMenu).toHaveAttribute('data-placement', 'above');
    const trigger = toolbar.getByRole('button', { name: 'Отправить в проект' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const triggerBox = await trigger.boundingBox();
    const menuBox = await projectMenu.boundingBox();
    expect(Math.abs(menuBox!.y + menuBox!.height + 8 - triggerBox!.y)).toBeLessThan(2);
    await page.screenshot({ path: testInfo.outputPath('library-project-dropdown.png') });
    await projectMenu.getByRole('searchbox').fill('no-such-project');
    await expect(projectMenu.getByRole('status')).toHaveText('Проекты не найдены.');
    await projectMenu.getByRole('searchbox').fill('Library QA');
    await page.keyboard.press('ArrowDown');
    await expect(projectMenu.getByRole('menuitem').first()).toBeFocused();
    const beforeArrow = page.url();
    await page.keyboard.press('ArrowRight');
    expect(page.url()).toBe(beforeArrow);
    await page.keyboard.press('Escape');
    await expect(projectMenu).toHaveCount(0);
    await expect(toolbar).toBeVisible();
    await expect(trigger).toBeFocused();
    // A long response remains scrollable; no extra test projects are stored.
    const projectPayload = await (await owner.http.request('/api/projects')).json();
    const synthetic = Array.from({ length: 80 }, (_, i) => ({ ...projectPayload.projects[0],
      id: `019a1234-0000-7000-8000-${String(i).padStart(12, '0')}`, name: `Dropdown QA ${i + 1}`, thumbnailUrl: '' }));
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: { projects: [...projectPayload.projects, ...synthetic,
        { ...synthetic[0], id: 'foreign-project', workspaceId: 'another-workspace', name: 'Hidden foreign project' },
        { ...synthetic[0], id: 'trashed-project', status: 'trash', name: 'Hidden trashed project' }] } }) : route.continue());
    await trigger.click();
    await expect(projectMenu.getByRole('menuitem')).toHaveCount(82);
    expect(await projectMenu.locator('.library-project-list').evaluate((list) => list.scrollHeight > list.clientHeight)).toBe(true);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('End');
    await expect(projectMenu.getByRole('menuitem').last()).toBeFocused();
    expect(await projectMenu.locator('.library-project-list').evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
    await projectMenu.getByRole('searchbox').fill('Hidden');
    await expect(projectMenu.getByRole('menuitem')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.unroute('**/api/projects');
    await trigger.click(); await expect(projectMenu).toBeVisible();
    await trigger.click(); await expect(projectMenu).toHaveCount(0);
    await trigger.click(); await expect(projectMenu).toBeVisible();
    const emptyArea = await page.locator('.image-viewer-viewport').boundingBox();
    await page.mouse.click(emptyArea!.x + 2, emptyArea!.y + 2);
    await expect(projectMenu).toHaveCount(0); await expect(toolbar).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    await trigger.click(); await expect(projectMenu).toBeVisible();
    await expect.poll(async () => {
      const box = await projectMenu.boundingBox();
      return Boolean(box && box.x >= 8 && box.x + box.width <= 367 && box.y >= 8 && box.y + box.height <= 804);
    }).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('library-project-dropdown-mobile.png') });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoQaSection(page, `/projects/${targets[0]}`);
    await expect(page.locator('[data-node-id="existing-prompt"]')).toBeVisible();
    // A focused text editor keeps normal paste behavior, without creating an Import.
    const editor = page.locator('[data-node-id="existing-prompt"] .text-prompt-variable-content');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(editor).toContainText(link);
    await expect(imports()).toHaveCount(0);
    await focusCanvas(page);
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(() => nodeCount(page)).toBe(2);
    await expect(imports()).toHaveCount(1);
    await expect(imports().locator('img').first()).toHaveAttribute('src', new RegExp(`/api/assets/${asset.id}/content\\?variant=thumbnail`));
    await page.keyboard.press('ControlOrMeta+z');
    await expect(imports()).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(imports()).toHaveCount(1);

    // A previous node copy must not swallow a freshly copied Library reference.
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(imports()).toHaveCount(2);
    await page.evaluate((text) => navigator.clipboard.writeText(text), link);
    await page.keyboard.press('ControlOrMeta+v');
    await expect(imports()).toHaveCount(3);
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.assets.length, key)).toBe(1);
    await expect.poll(async () => {
      const result = await owner.http.request(`/api/projects/${targets[0]}`);
      return (await result.json()).project.snapshot.project.nodes.length;
    }).toBe(4);
    await page.reload();
    await expect(imports()).toHaveCount(3);
    await expect(page.locator('[data-node-id="existing-prompt"]')).toContainText('Keep this existing text.');

    await gotoQaSection(page, '/library');
    const card = page.locator('.library-card').filter({ has: page.locator(`a[href="/library/${asset.id}"]`) });
    await expect(card).toBeVisible();
    await card.locator('a').click();
    await expect(page.getByRole('dialog', { name: 'Image viewer', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Next generated image' }).click();
    await expect(page).toHaveURL(`${origin.origin}/library/${secondAsset.id}`);
    await toolbar.getByRole('button', { name: 'Скопировать ссылку' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin.origin}/api/assets/${secondAsset.id}/content`);
    await page.getByRole('button', { name: 'Close image viewer', exact: true }).last().click();
    await expect(page).toHaveURL(`${origin.origin}/library`);
    await expect(page.getByRole('dialog', { name: 'Image viewer', exact: true })).toHaveCount(0);
    await card.click({ button: 'right' });
    await page.locator('.context-menu').getByRole('button', { name: 'Скопировать ссылку' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await card.getByRole('button', { name: /Действия с/ }).click();
    await page.locator('.context-menu').getByRole('button', { name: 'Добавить в проект' }).click();
    const picker = page.getByRole('region', { name: 'Отправить в проект' });
    await picker.getByRole('searchbox').fill('send target');
    await expect(picker.locator('.library-project-list > button')).toHaveCount(1);
    await picker.getByRole('menuitem', { name: 'Library QA — send target' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${targets[1]}`));
    await expect(imports()).toHaveCount(1);
    await expect(page).toHaveURL(`${origin.origin}/projects/${targets[1]}`);
    await expect(page.locator('[data-node-id="existing-prompt"]')).toContainText('Keep this existing text.');
    const insertedId = await imports().getAttribute('data-node-id');
    await expect.poll(async () => (await (await owner.http.request(`/api/projects/${targets[1]}`)).json()).project.snapshot.project.nodes.length).toBe(2);
    await gotoQaSection(page, `/projects/${targets[1]}?importAsset=${asset.id}&importRequest=${insertedId!.replace('library-import-', '')}`);
    await expect(imports()).toHaveCount(1);
    await expect(page).toHaveURL(`${origin.origin}/projects/${targets[1]}`);
    await page.reload();
    await expect(imports()).toHaveCount(1);
    const listed = await owner.http.request(`/api/assets?workspaceId=${owner.workspaceId}`);
    expect((await listed.json()).items.filter((item: { id: string }) => item.id === asset.id)).toHaveLength(1);
    // A pasted link is not a public storage grant.
    expect([401, 403]).toContain((await fetch(link, { redirect: 'manual' })).status);
    const other = await createAudioQaOwner(origin.origin, 'library-foreign');
    try {
      expect([403, 404]).toContain((await other.http.request(`/api/assets/${asset.id}?view=library`)).status);
      expect([403, 404]).toContain((await other.http.request(`/api/assets/${asset.id}/content`)).status);
    } finally { await other.http.request('/api/auth/sign-out', { json: {} }); }

    // Failed metadata checks do not change the graph or start uploads.
    const metadataPattern = `**/api/assets/${asset.id}?view=library`;
    await page.route(metadataPattern, (route) => route.fulfill({ status: 403, body: '{}' }));
    await focusCanvas(page);
    await page.evaluate((text) => navigator.clipboard.writeText(text), link);
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.locator('.assistant-notice')).toContainText('Изображение недоступно');
    await expect(imports()).toHaveCount(1);
    await page.unroute(metadataPattern);

    // Switching boards while metadata is in flight must not paste into the next board.
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started = false;
    await page.route(metadataPattern, async (route) => { started = true; await gate; await route.continue().catch(() => {}); });
    await focusCanvas(page);
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(() => started).toBe(true);
    await gotoQaSection(page, `/projects/${targets[0]}`);
    release();
    await expect(imports()).toHaveCount(3);
    await page.unroute(metadataPattern);
    expect(paidRequests).toBe(0);
  } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
});
