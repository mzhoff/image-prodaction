import { gotoQaSection } from './release-user-fixture';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import type { GenerateImageNodeData } from '../src/entities/production-graph/model/types';
import type { OpenRouterModelCatalog } from '../src/shared/api/openrouter-model-contracts';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1200 } });

test('live image models have logos, conditional settings and a preserved OpenRouter request without payment', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'image-models');
  await context.addCookies(owner.http.browserSessionCookies());
  const response = await owner.http.request('/api/ai/models');
  const catalog = await response.json() as OpenRouterModelCatalog;
  expect(catalog.imageCatalogError).toBeUndefined();
  const flare = catalog.generationModels!.find((model) => model.id === 'openai/gpt-image-2.5-flare')!;
  const flux = catalog.generationModels!.find((model) => model.id === 'black-forest-labs/flux.2-pro')!;
  expect(flare).toBeDefined(); expect(flux).toBeDefined();
  expect(catalog.generationModels!.length).toBeGreaterThan(7);
  const image = createDefaultNode('generateImage', { x: 160, y: 35 });
  image.data = { ...image.data, prompt: 'A yellow flower on a plain background.' };
  const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [image], edges: [], assets: [] }, createEmptyProjectUiState());
  const document = { id: randomUUID(), name: 'QA Image Models', workspaceId: owner.workspaceId, revision: 1,
    schemaVersion: snapshot.schemaVersion, snapshot, favorite: false, hasEverHadContent: true,
    status: 'active', thumbnailAvailable: false, thumbnailMode: 'auto', thumbnailUrl: '' };
  let submitted: Record<string, unknown> | undefined;
  let forbiddenCalls = 0;
  await page.route('**/api/ai/**', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    if (route.request().url().endsWith('/generate-image')) {
      submitted = route.request().postDataJSON();
      return route.fulfill({ status: 400, json: { error: { code: 'qa_only', message: 'QA: paid request intercepted.' } } });
    }
    forbiddenCalls++; return route.abort();
  });
  await page.route(`**/api/projects/${document.id}/thumbnail`, (route) => route.fulfill({ json: { project: document } }));
  await page.route(`**/api/projects/${document.id}`, (route) => {
    if (route.request().method() === 'PATCH') { document.snapshot = route.request().postDataJSON().snapshot; document.revision++; }
    return route.fulfill({ json: { project: document } });
  });
  const data = () => document.snapshot.project.nodes[0].data as GenerateImageNodeData;
  try {
    await gotoQaSection(page, `/projects/${document.id}`);
    const node = page.locator(`article[data-node-id="${image.id}"]`);
    const modelSelect = node.getByRole('button', { name: 'Image model', exact: true });
    await modelSelect.click();
    await expect(page.locator('[data-model-choice]')).toHaveCount(catalog.generationModels!.length);
    await expect(page.getByRole('button', { name: flare.label, exact: true }).locator('.video-model-logo')).toHaveCount(1);
    await page.getByRole('button', { name: flare.label, exact: true }).click();
    await expect(node.locator('.setting-row').filter({ hasText: /^Size/ })).toHaveCount(0);
    await node.getByRole('button', { name: 'Image quality', exact: true }).click();
    await page.getByRole('option', { name: 'xhigh', exact: true }).click();
    await node.getByRole('button', { name: 'Image background', exact: true }).click();
    await page.getByRole('option', { name: 'transparent', exact: true }).click();
    await expect.poll(() => data().imageQuality).toBe('xhigh');
    await expect.poll(() => data().size).toBe('auto');
    await page.reload();
    await expect(node.getByRole('button', { name: 'Image quality', exact: true })).toContainText('xhigh');
    await node.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect.poll(() => submitted?.model).toBe(flare.id);
    expect(submitted).toMatchObject({ size: 'auto', imageQuality: 'xhigh', imageBackground: 'transparent' });
    await expect(node.getByText('QA: paid request intercepted.')).toBeVisible();
    await modelSelect.click();
    await page.getByRole('button', { name: flux.label, exact: true }).click();
    await expect(node.getByRole('button', { name: 'Image quality', exact: true })).toHaveCount(0);
    await expect(node.getByRole('button', { name: 'Image format', exact: true })).toBeVisible();
    await node.getByRole('spinbutton', { name: 'Image seed' }).fill('73');
    await expect.poll(() => data().imageSeed).toBe(73);
    await expect.poll(() => data().imageQuality).toBeUndefined();
    await modelSelect.click();
    await page.getByRole('button', { name: flare.label, exact: true }).click();
    await expect(node.getByRole('spinbutton', { name: 'Image seed' })).toHaveCount(0);
    await expect.poll(() => data().imageSeed).toBeUndefined();
    await modelSelect.click();
    await page.getByRole('button', { name: flare.label, exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/image-models-selector.png' });
    expect(forbiddenCalls).toBe(0);
  } finally {
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});
