import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { mapRemoteImageAsset } from '../src/entities/production-graph/lib/remote-asset';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import type { AssetRecord, ExportImageNodeData, ProductionNode } from '../src/entities/production-graph/model/types';
import { audioQaForm, createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL, trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

test('Export browses inputs and upstream history without changing output; current actions convert the selected file', async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(150_000);
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  const api = new URL(process.env.EXPORT_CAROUSEL_API_URL ?? origin.origin);
  for (const url of [origin, api]) if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(api.origin, 'export-carousel');
  await context.addCookies(owner.http.browserSessionCookies().map((cookie) => ({ ...cookie, url: origin.origin })));
  const assets: AssetRecord[] = [];
  for (const [i, [width, height, background]] of [[320, 480, '#ce294b'], [400, 300, '#2bb479'], [200, 300, '#3958d8']].entries()) {
    const bytes = await sharp({ create: { width: Number(width), height: Number(height), channels: 3, background: String(background) } }).png().toBuffer();
    const form = audioQaForm(bytes, owner.workspaceId, true);
    form.set('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), `variant-${i + 1}.png`);
    const upload = await owner.http.request('/api/assets/images', { form });
    expect(upload.status).toBe(201);
    assets.push(mapRemoteImageAsset((await upload.json()).asset));
  }
  const source = createDefaultNode('importImage', { x: 0, y: 0 });
  source.data = { ...source.data, assetId: assets[0].id };
  const history = createDefaultNode('generateImage', { x: 0, y: 600 });
  history.data = { ...history.data, title: 'History', resultAssetIds: [assets[1].id, assets[2].id], resultAssetId: assets[2].id, activeResultIndex: 1 };
  const output = createDefaultNode('exportImage', { x: 550, y: 0 });
  output.data = { ...output.data, title: 'Казбекская', imageInputCount: 2, format: 'webp', quality: '90', scale: '0.5', background: 'white' };
  const edges = [{ id: 'history-export', sourceNodeId: history.id, sourcePortId: 'image', targetNodeId: output.id, targetPortId: 'image-1' },
    { id: 'source-export', sourceNodeId: source.id, sourcePortId: 'image', targetNodeId: output.id, targetPortId: 'image-0' }];
  const created = await owner.http.request('/api/projects', { json: { name: 'QA Export carousel', workspaceId: owner.workspaceId } });
  expect(created.status).toBe(201);
  const { project } = await created.json();
  const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [source, history, output], assets, edges }, createEmptyProjectUiState());
  expect((await owner.http.request(`/api/projects/${project.id}`, { method: 'PATCH', json: { expectedRevision: project.revision, snapshot } })).status).toBe(200);
  let paidRequests = 0;
  await page.route('**/api/ai/**', (route) => { if (route.request().method() === 'GET') return route.continue(); paidRequests++; return route.abort(); });
  const card = page.locator(`[data-node-id="${output.id}"]`);
  const plate = card.locator('.image-plate');
  const next = card.getByRole('button', { name: 'Next export image', exact: true });
  const previous = card.getByRole('button', { name: 'Previous export image', exact: true });
  const badge = card.locator('.image-plate-version-badge');
  const currentDownload = card.getByRole('button', { name: 'Download image', exact: true });
  const readOutput = () => page.evaluate((id) => {
    const state = JSON.parse(localStorage.getItem('reverie-image-production-project:v1')!).state;
    return (state.nodes as ProductionNode[]).find((node) => node.id === id)!.data as ExportImageNodeData;
  }, output.id);
  const downloadCurrent = async (name: string, width: number, height: number) => {
    await plate.hover();
    await expect(currentDownload).toBeEnabled();
    const pending = page.waitForEvent('download');
    await currentDownload.click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(name);
    const meta = await sharp(await readFile((await download.path())!)).metadata();
    expect({ format: meta.format, width: meta.width, height: meta.height }).toEqual({ format: 'webp', width, height });
  };
  try {
    await page.goto(`/projects/${project.id}`);
    await expect(card).toBeVisible();
    await expect(currentDownload).toBeEnabled();
    const canonical = await readOutput();
    expect(canonical.sourceAssetId).toBe(assets[0].id);
    await expect(badge).toHaveText('1/3');
    await page.mouse.move(1400, 950);
    await expect(card.locator('.image-plate-version-controls')).toHaveCSS('opacity', '0');
    await plate.hover();
    await expect(card.locator('.image-plate-version-controls')).toHaveCSS('opacity', '1');
    await downloadCurrent('variant-1.webp', 160, 240);
    await next.click();
    await expect(badge).toHaveText('2/3');
    await next.click();
    await expect(badge).toHaveText('3/3');
    await downloadCurrent('variant-3.webp', 100, 150);
    await previous.click();
    await downloadCurrent('variant-2.webp', 200, 150);
    await next.click();
    await next.click(); await expect(badge).toHaveText('1/3');
    await previous.click(); await expect(badge).toHaveText('3/3');
    await previous.click(); await expect(badge).toHaveText('2/3');
    expect((await readOutput()).resultAssetId).toBe(canonical.resultAssetId);
    expect((await readOutput()).sourceAssetId).toBe(assets[0].id);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('export-hover-carousel.png') });

    await card.getByRole('button', { name: 'Open image', exact: true }).click();
    const viewer = page.getByRole('dialog', { name: 'Image viewer', exact: true });
    await expect(viewer).toBeVisible();
    await viewer.getByRole('button', { name: 'Close image viewer', exact: true }).last().click();
    const saving = page.waitForResponse((response) => response.url().endsWith('/api/assets/images') && response.request().method() === 'POST');
    await card.getByRole('button', { name: 'Save current to Library', exact: true }).click();
    const saved = await saving;
    expect(saved.status()).toBe(201);
    const savedAsset = mapRemoteImageAsset((await saved.json()).asset);
    expect({ width: savedAsset.width, height: savedAsset.height, mimeType: savedAsset.mimeType }).toEqual({ width: 200, height: 150, mimeType: 'image/webp' });
    const zipDownload = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Download ZIP', exact: true }).click();
    const zip = await zipDownload;
    expect(zip.suggestedFilename()).toMatch(/^Казбекская__\d{4}-\d{2}-\d{2}_[\d-]+Z__[a-f\d]{32}\.zip$/);
    const archive = await readFile((await zip.path())!);
    expect(archive.readUInt16LE(archive.length - 12)).toBe(3);
    const stem = zip.suggestedFilename().slice(0, -4);
    expect(readZipNames(archive)).toEqual([`${stem}__001.webp`, `${stem}__002.webp`, `${stem}__003.webp`]);
    expect((await readOutput()).resultAssetId).toBe(canonical.resultAssetId);

    const repeatDownload = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Download ZIP', exact: true }).click();
    const repeatZip = await repeatDownload;
    expect(repeatZip.suggestedFilename()).not.toBe(zip.suggestedFilename());
    expect(repeatZip.suggestedFilename()).toMatch(/^Казбекская__/);

    // Read the latest node title at the next click, including a title with dots.
    await card.locator('.node-title-editable-label').dblclick();
    await card.locator('.node-title-input').fill('Казбекская. версия 2');
    await card.locator('.node-title-input').press('Enter');
    const renameDownload = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Download ZIP', exact: true }).click();
    const renamedZip = await renameDownload;
    expect(renamedZip.suggestedFilename()).toMatch(/^Казбекская\. версия 2__/);
    const renamedStem = renamedZip.suggestedFilename().slice(0, -4);
    expect(readZipNames(await readFile((await renamedZip.path())!))).toEqual(
      [1, 2, 3].map((index) => `${renamedStem}__00${index}.webp`),
    );

    // Converted previews must be invalidated when export settings change.
    await card.getByRole('button', { name: '50%', exact: true }).click();
    await page.getByRole('option', { name: '25%', exact: true }).click();
    await downloadCurrent('variant-2.webp', 100, 75);
    expect((await readOutput()).sourceAssetId).toBe(assets[0].id);

    await page.locator(`[data-node-id="${history.id}"]`).dispatchEvent('pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    await page.locator('body').dispatchEvent('pointerup', { button: 0, pointerId: 1 });
    await page.keyboard.press('Delete');
    await expect(card.locator('.image-plate-version-controls')).toHaveCount(0);
    await expect(badge).toHaveCount(0);
    await downloadCurrent('variant-1.webp', 80, 120);
    const singleDownload = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Download', exact: true }).click();
    const single = await singleDownload;
    expect(single.suggestedFilename()).toMatch(/^Казбекская\. версия 2__.+__001\.webp$/);
    const singleMeta = await sharp(await readFile((await single.path())!)).metadata();
    expect({ format: singleMeta.format, width: singleMeta.width, height: singleMeta.height })
      .toEqual({ format: 'webp', width: 80, height: 120 });
    expect(paidRequests).toBe(0);
  } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
});

function readZipNames(archive: Buffer) {
  const names: string[] = [];
  const count = archive.readUInt16LE(archive.length - 12);
  let offset = archive.readUInt32LE(archive.length - 6);
  for (let index = 0; index < count; index++) {
    expect(archive.readUInt32LE(offset)).toBe(0x02014b50);
    expect(archive.readUInt16LE(offset + 8) & 0x0800).toBe(0x0800);
    const length = archive.readUInt16LE(offset + 28);
    names.push(archive.toString('utf8', offset + 46, offset + 46 + length));
    offset += 46 + length + archive.readUInt16LE(offset + 30) + archive.readUInt16LE(offset + 32);
  }
  return names;
}
