import { gotoQaSection } from './release-user-fixture';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL, trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

test('Extract created from a dragged image wire keeps its connection after autosave and reload', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'extract-wire-create');
  await context.addCookies(owner.http.browserSessionCookies());
  const source = createDefaultNode('importImage', { x: 30, y: 90 });
  // The document and its autosaves stay in this test, never in a user's workspace.
  const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [source] }, createEmptyProjectUiState());
  const document = { id: randomUUID(), name: 'QA Extract wire', workspaceId: owner.workspaceId,
    revision: 1, schemaVersion: snapshot.schemaVersion, snapshot, favorite: false, hasEverHadContent: true,
    status: 'active', thumbnailAvailable: false, thumbnailMode: 'auto', thumbnailUrl: '' };
  let paidCalls = 0;
  await page.route('**/api/ai/**', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    paidCalls++;
    return route.abort();
  });
  await page.route(`**/api/projects/${document.id}/thumbnail`, (route) => route.fulfill({ json: { project: document } }));
  await page.route(`**/api/projects/${document.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      document.snapshot = route.request().postDataJSON().snapshot;
      document.revision++;
    }
    await route.fulfill({ json: { project: document } });
  });
  try {
    await gotoQaSection(page, `/projects/${document.id}`);
    const output = page.locator(`[data-node-id="${source.id}"] button.node-port[data-port-id="image"]`);
    await expect(output).toBeVisible();
    const box = (await output.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(780, 220, { steps: 12 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Extract', exact: true }).click();
    const extract = page.locator('.production-node-imageToText');
    await expect(extract).toHaveCount(1);
    await expect(extract.locator('button.node-port[data-port-id="image-0"]')).toHaveClass(/node-port-connected/);
    await expect(extract.locator('button.node-port[data-port-id="image-1"]')).toBeVisible();
    await expect.poll(() => document.snapshot.project.edges.length).toBe(1);
    const edge = document.snapshot.project.edges[0];
    expect(edge).toMatchObject({ sourceNodeId: source.id, sourcePortId: 'image', targetPortId: 'image-0' });
    await page.reload();
    await expect(extract.locator('button.node-port[data-port-id="image-0"]')).toHaveClass(/node-port-connected/);
    expect(document.snapshot.project.edges).toEqual([edge]);
    expect(paidCalls).toBe(0);
  } finally {
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});
