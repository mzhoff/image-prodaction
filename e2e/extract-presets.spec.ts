import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import type { AssetRecord, ImageToTextNodeData } from '../src/entities/production-graph/model/types';
import { createFallbackCatalog } from '../src/shared/api/openrouter-models';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL, trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

const still = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const legacyPrompt = 'Авторский промпт старого Extract: сохрани силуэт и позу.';
const graphicsPrompt = '[TYPOGRAPHY]\nСохрани широкие буквы.\n\n[WHITESPACE]\nОставь свободные поля.';
const graphicsResult = '[TYPOGRAPHY]\nШирокий геометрический гротеск.\n\n[WHITESPACE]\nПоля занимают около трети макета.';
const layerLabels = {
  Composition: ['All Layers', 'Actors', 'Actions', 'Composition', 'Camera', 'Background / Environment', 'Style', 'Light', 'Color / Grade', 'Metaphor / Meaning', 'Text'],
  Graphics: ['All Layers', 'Composition', 'Mood', 'Graphic Style', 'Typography', 'Whitespace', 'Palette', 'Background Style', 'Overall Style', 'Visual Hierarchy', 'Decorative Elements', 'Texture', 'Text'],
  Character: ['All Layers', 'Appearance', 'Apparent Age', 'Facial Features', 'Physique', 'Hair', 'Clothing', 'Accessories', 'Expression', 'Pose', 'Persona', 'Distinctive Features', 'Style'],
  Location: ['All Layers', 'Space Type', 'Architecture', 'Spatial Layout', 'Materials', 'Furnishings', 'Vegetation', 'Surroundings', 'Light', 'Atmosphere', 'Color / Grade', 'Camera', 'Style'],
};

test('Extract presets preserve drafts and expose selected graphic layers through the real UI and downstream output', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'extract-presets');
  await context.addCookies(owner.http.browserSessionCookies());
  const source = createDefaultNode('importImage', { x: 30, y: 100 });
  const extract = createDefaultNode('imageToText', { x: 420, y: 100 });
  const concat = createDefaultNode('textConcat', { x: 840, y: 100 });
  const imageId = randomUUID();
  const asset: AssetRecord = { id: imageId, kind: 'image', name: 'extract-qa-pixel.png', mimeType: 'image/png',
    width: 1, height: 1, createdAt: new Date().toISOString(), storage: { type: 'remote', assetId: imageId } };
  source.data = { title: 'QA image', assetId: imageId };
  // Deliberately load a legacy node without the new analysisPreset field.
  extract.data = { title: 'Extract', preset: 'actors', prompt: legacyPrompt, result: '[ACTORS]\nСохранённый силуэт.' };
  const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [source, extract, concat], assets: [asset], edges: [
    { id: randomUUID(), sourceNodeId: source.id, sourcePortId: 'image', targetNodeId: extract.id, targetPortId: 'image-0' },
    { id: randomUUID(), sourceNodeId: extract.id, sourcePortId: 'result', targetNodeId: concat.id, targetPortId: 'text-0' },
  ] }, createEmptyProjectUiState());
  const document = { id: randomUUID(), name: 'QA Extract presets', workspaceId: owner.workspaceId,
    revision: 1, schemaVersion: snapshot.schemaVersion, snapshot, favorite: false, hasEverHadContent: true,
    status: 'active', thumbnailAvailable: false, thumbnailMode: 'auto', thumbnailUrl: '' };
  const analyzePayloads: Array<{ analysisPreset: string; prompt: string; imageDataUrls: string[] }> = [];
  const unexpectedAiRequests: string[] = [];
  let releaseAnalysis = () => {};
  const analysisRelease = new Promise<void>((resolve) => { releaseAnalysis = resolve; });

  // All browser mutations are blocked by default, including every paid endpoint.
  // Only the in-memory document and the explicit fixture Analyze response override this guard.
  await context.route('**/api/**', (route) => (
    ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort()
  ));
  await page.route('**/api/ai/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/api/ai/models') {
      await route.fulfill({ json: createFallbackCatalog() });
      return;
    }
    if (request.method() === 'GET' && path === '/api/ai/balance') {
      await route.fulfill({ json: { limit: null, remaining: null, used: 0, usedToday: 0, usedMonth: 0,
        updatedAt: new Date().toISOString(), provider: 'openrouter' } });
      return;
    }
    if (request.method() === 'POST' && path === '/api/ai/analyze-image') {
      analyzePayloads.push(request.postDataJSON());
      await analysisRelease;
      await route.fulfill({ json: { text: graphicsResult } });
      return;
    }
    unexpectedAiRequests.push(`${request.method()} ${path}`);
    await route.abort();
  });
  await page.route(`**/api/assets/${imageId}/content*`, (route) => route.fulfill({ contentType: 'image/png', body: still }));
  await page.route(`**/api/projects/${document.id}/thumbnail`, (route) => route.fulfill({ json: { project: document } }));
  await page.route(`**/api/projects/${document.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      document.snapshot = route.request().postDataJSON().snapshot;
      document.revision++;
    }
    await route.fulfill({ json: { project: document } });
  });
  const savedExtract = () => document.snapshot.project.nodes.find((node) => node.id === extract.id)!.data as ImageToTextNodeData;

  try {
    await page.goto(`/projects/${document.id}`);
    const node = page.locator(`[data-node-id="${extract.id}"]`);
    const presetControl = node.getByRole('button', { name: 'Extract preset', exact: true });
    const layerControl = node.getByRole('button', { name: 'Extract layers', exact: true });
    const prompt = node.locator('textarea[data-text-field="prompt"]');
    const result = node.getByRole('textbox', { name: 'Extract result', exact: true });
    const downstream = page.locator(`[data-node-id="${concat.id}"]`).getByRole('textbox', { name: 'Concat result', exact: true });
    const choosePreset = async (label: keyof typeof layerLabels) => {
      await presetControl.click();
      await page.getByRole('option', { name: label, exact: true }).click();
      await expect(presetControl).toHaveText(label);
    };
    const checkLayers = async (label: keyof typeof layerLabels) => {
      await layerControl.click();
      await expect(page.getByRole('listbox', { name: 'Extract layers', exact: true }).getByRole('option')).toHaveText(layerLabels[label]);
      await page.keyboard.press('Escape');
    };

    await expect(presetControl).toHaveText('Composition');
    await expect(node.locator('.setting-row > span')).toHaveText(['Preset', 'Layers', 'Model']);
    await expect(prompt).toHaveValue(legacyPrompt);
    await expect(layerControl).toHaveText('Actors');
    await checkLayers('Composition');
    await presetControl.click();
    await expect(page.getByRole('listbox', { name: 'Extract preset', exact: true }).getByRole('option')).toHaveText(['Composition', 'Graphics', 'Character', 'Location']);
    await page.keyboard.press('Escape');

    await choosePreset('Graphics');
    await checkLayers('Graphics');
    await expect(prompt).toHaveValue(/\[GRAPHIC STYLE\]/);
    await layerControl.click();
    await page.getByRole('option', { name: 'Typography', exact: true }).click();
    await page.getByRole('option', { name: 'Whitespace', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(layerControl).toHaveText('2 layers');
    await expect(prompt).toHaveValue(/selectedLayers: Typography, Whitespace\n/);
    await prompt.fill(graphicsPrompt);

    await choosePreset('Character');
    await checkLayers('Character');
    await expect(prompt).toHaveValue(/\[FACIAL FEATURES\]/);
    await choosePreset('Location');
    await checkLayers('Location');
    await expect(prompt).toHaveValue(/\[ARCHITECTURE\]/);
    await choosePreset('Composition');
    await expect(prompt).toHaveValue(legacyPrompt);
    await expect(layerControl).toHaveText('Actors');
    await expect(result).toContainText('Сохранённый силуэт.');
    await choosePreset('Graphics');
    await expect(prompt).toHaveValue(graphicsPrompt);
    await expect(layerControl).toHaveText('2 layers');
    expect(analyzePayloads).toHaveLength(0);

    await node.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect.poll(() => analyzePayloads.length).toBe(1);
    expect(analyzePayloads[0]).toMatchObject({ analysisPreset: 'graphics', prompt: graphicsPrompt });
    expect(analyzePayloads[0].imageDataUrls).toHaveLength(1);
    expect(analyzePayloads[0].imageDataUrls[0]).toMatch(/^data:image\//);
    await expect(presetControl).toBeDisabled();
    await expect(layerControl).toBeDisabled();
    await expect(result).toContainText('Сохранённый силуэт.');
    releaseAnalysis();
    await expect(presetControl).toBeEnabled();
    await expect(result).toContainText('Широкий геометрический гротеск.');
    await expect(downstream).toContainText('Поля занимают около трети макета.');
    if (process.env.EXTRACT_PRESETS_SCREENSHOT_PATH) {
      await page.screenshot({ path: process.env.EXTRACT_PRESETS_SCREENSHOT_PATH });
    }
    const whitespaceBadge = node.locator('.extract-layer-tags').getByRole('button', { name: 'WHITESPACE', exact: true });
    await expect(whitespaceBadge).toHaveAttribute('aria-pressed', 'true');
    await whitespaceBadge.click();
    await expect(whitespaceBadge).toHaveAttribute('aria-pressed', 'false');
    await expect(result).toContainText('Поля занимают около трети макета.');
    await expect(downstream).not.toContainText('Поля занимают около трети макета.');
    await expect(downstream).toContainText('Широкий геометрический гротеск.');
    await expect.poll(() => savedExtract()).toMatchObject({ analysisPreset: 'graphics', presets: ['typography', 'whitespace'],
      prompt: graphicsPrompt, result: graphicsResult, disabledLayerIds: ['whitespace'],
      analysisPresetDrafts: { composition: { presets: ['actors'], prompt: legacyPrompt } } });

    await page.reload();
    await expect(presetControl).toHaveText('Graphics');
    await expect(layerControl).toHaveText('2 layers');
    await expect(prompt).toHaveValue(graphicsPrompt);
    await expect(whitespaceBadge).toHaveAttribute('aria-pressed', 'false');
    await expect(downstream).not.toContainText('Поля занимают около трети макета.');
    await choosePreset('Composition');
    await expect(prompt).toHaveValue(legacyPrompt);
    await choosePreset('Graphics');
    await expect(prompt).toHaveValue(graphicsPrompt);
    await expect(whitespaceBadge).toHaveAttribute('aria-pressed', 'false');
    expect(analyzePayloads).toHaveLength(1);
    expect(unexpectedAiRequests).toEqual([]);
  } finally {
    releaseAnalysis();
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});
