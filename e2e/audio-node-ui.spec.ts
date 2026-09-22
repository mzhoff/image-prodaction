import { gotoQaSection } from './release-user-fixture';
import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '../src/entities/production-graph/model/project-schema';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1600, height: 1000 } });

test('Transcribe shares Voice controls and Prompt styling without changing transcript or model ID', async ({ page }, testInfo) => {
  test.skip(process.env.AUDIO_LOCAL_E2E !== '1', 'Explicit local-only audio QA opt-in is required.');
  const origin = testInfo.project.use.baseURL!;
  expect(['localhost', '127.0.0.1']).toContain(new URL(origin).hostname);
  const owner = await createAudioQaOwner(process.env.AUDIO_QA_AUTH_ORIGIN ?? origin, 'transcribe-ui');
  await page.context().addCookies(owner.http.browserSessionCookies());
  const created = await page.request.post('/api/projects', { headers: { origin }, data: {
    workspaceId: owner.workspaceId, name: 'Transcribe UI local QA',
  } });
  expect(created.status()).toBe(201);
  const document = (await created.json()).project;
  const prompt = createDefaultNode('textPrompt', { x: 20, y: 60 });
  const voice = createDefaultNode('textToSpeech', { x: 500, y: 60 });
  const transcribe = createDefaultNode('speechToText', { x: 980, y: 60 });
  const transcript = 'Так, бро, отлично. Проверяем аудиовходы, speech-to-text и Canvas.\n\nИ в рантайме на сервере, на бэкенде.';
  prompt.data = { ...prompt.data, text: transcript };
  voice.data = { ...voice.data, model: 'google/gemini-3.1-flash-tts-preview' };
  transcribe.data = { ...transcribe.data, result: transcript };
  const project = { ...structuredClone(initialProject), nodes: [prompt, voice, transcribe], edges: [] };
  const uiState = createEmptyProjectUiState(); uiState.viewport = { x: 30, y: 70, zoom: 0.9 };
  const seeded = await page.request.patch(`/api/projects/${document.id}`, { headers: { origin }, data: {
    expectedRevision: document.revision, snapshot: createProjectExport(project, uiState),
  } });
  expect(seeded.status()).toBe(200);
  let paidRequests = 0;
  for (const endpoint of ['transcribe-audio', 'generate-speech']) await page.route(`**/api/ai/${endpoint}`, (route) => {
    paidRequests++; return route.abort('blockedbyclient');
  });
  await gotoQaSection(page, `/projects/${document.id}`);
  const card = page.locator(`[data-node-id="${transcribe.id}"]`);
  const voiceCard = page.locator(`[data-node-id="${voice.id}"]`);
  const modelButton = card.getByRole('button', { name: 'Gemini 3.1 Flash Lite', exact: true });
  const languageButton = card.getByRole('button', { name: 'Auto', exact: true });
  const result = card.getByRole('textbox', { name: 'Transcribed text', exact: true });
  await expect(result).toHaveValue(transcript);
  await expect(result).toHaveAttribute('readonly', '');
  await expect(result).toHaveCSS('font-size', '12px');
  await expect(result).toHaveCSS('background-color', 'rgb(245, 245, 245)');
  await expect(result).toHaveCSS('border-radius', '10px');
  await expect(result).toHaveCSS('border-top-width', '0px');
  await expect(modelButton.locator('svg')).toHaveCSS('width', '13px');
  await expect(languageButton.locator('svg')).toHaveCSS('width', '13px');
  const voiceModel = voiceCard.getByRole('button', { name: 'Gemini 3.1 Flash TTS', exact: true });
  await expect(voiceModel).toBeVisible();
  expect(await voiceModel.locator('.mini-select-label').evaluate((label) => label.scrollWidth > label.clientWidth)).toBe(false);
  const layout = await card.evaluate((element) => {
    const left = element.getBoundingClientRect().left;
    return {
      titleOffsets: [...element.querySelectorAll('.node-section-title strong')].map((label) => label.getBoundingClientRect().left - left),
      rowOffsets: [...element.querySelectorAll('.setting-row > span')].map((label) => label.getBoundingClientRect().left - left),
      selectors: [...element.querySelectorAll('.mini-select')].map((button) => {
        const label = button.querySelector('.mini-select-label')!;
        return { clipped: label.scrollWidth > label.clientWidth, right: element.getBoundingClientRect().right - button.getBoundingClientRect().right };
      }),
    };
  });
  const voiceOffset = await voiceCard.locator('.node-section-title strong').first().evaluate((label) =>
    label.getBoundingClientRect().left - label.closest('article')!.getBoundingClientRect().left);
  for (const offset of [...layout.titleOffsets, ...layout.rowOffsets]) expect(offset).toBeCloseTo(voiceOffset, 1);
  for (const selector of layout.selectors) { expect(selector.clipped).toBe(false); expect(selector.right).toBeCloseTo(voiceOffset, 1); }
  await modelButton.click();
  await expect(page.getByRole('option', { name: 'Gemini 3.1 Flash Lite', exact: true })).toBeVisible();
  await page.getByRole('option', { name: 'Gemini 3.1 Flash Lite', exact: true }).click();
  await languageButton.click();
  await page.getByRole('option', { name: 'Russian', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Russian', exact: true })).toBeVisible();
  await expect.poll(async () => {
    const saved = (await (await page.request.get(`/api/projects/${document.id}`)).json()).project.snapshot;
    return saved?.project?.nodes?.find((node: { id: string }) => node.id === transcribe.id)?.data;
  }).toMatchObject({ model: 'google/gemini-3.1-flash-lite', language: 'ru', result: transcript });
  await page.screenshot({ path: testInfo.outputPath('transcribe-ui.png'), fullPage: true });
  await card.getByRole('button', { name: 'Collapse node', exact: true }).click();
  await expect(result).toHaveCount(0);
  await expect(card.locator('[data-port-id="audio"]')).toBeVisible();
  await expect(card.locator('[data-port-id="text"]')).toBeVisible();
  await card.getByRole('button', { name: 'Expand node', exact: true }).click();
  await expect.poll(async () => {
    const saved = (await (await page.request.get(`/api/projects/${document.id}`)).json()).project.snapshot;
    return saved?.uiState?.nodes?.[transcribe.id]?.collapsed;
  }).toBe(false);
  await page.reload();
  await expect(result).toHaveValue(transcript);
  await expect(modelButton).toBeVisible();
  expect(paidRequests).toBe(0);
});
