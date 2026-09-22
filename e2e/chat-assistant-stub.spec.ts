import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { waitForEmailLink } from '../scripts/mailpit-client';
import { completeOnboardingThroughApi, createFlowFromHome } from './release-user-fixture';
import { buildNodeAskAiDraft } from '../src/entities/production-graph/model/node-help';

test.use({ locale: 'ru-RU' });

const expectedAssistantReply = 'CHATMODULE_CI_OK';
const stubGateEnabled = process.env.E2E_CHAT_STUB === 'true';
const stubOrigin = process.env.E2E_CHAT_STUB_ORIGIN ?? 'http://127.0.0.1:4010';
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const owner = {
  email: `e2e-chat-${runId}@example.test`,
  name: 'E2E Chat Owner',
  password: 'E2eChatPass!2026',
};

test('Ask AI drafts a node question, sends manually and restores the turn', async ({ page, request }) => {
  test.skip(!stubGateEnabled, 'Set E2E_CHAT_STUB=true only with the local OpenRouter stub.');
  const initialStubStats = await readStubStats(request);
  await registerAndVerify(page);
  const spaces = await page.request.get('/api/workspaces');
  expect(spaces.ok()).toBe(true);
  const { workspaces } = await spaces.json() as { workspaces: Array<{ id: string }> };
  expect(workspaces.length).toBeGreaterThan(0);
  const connected = await page.request.post(`/api/workspaces/${workspaces[0].id}/providers/openrouter`, {
    headers: { Origin: new URL(page.url()).origin },
    data: { apiKey: process.env.FAKE_AI_PROVIDER_CREDENTIAL ?? 'fake-valid-credential' },
  });
  expect(connected.ok()).toBe(true);
  // Configure the test provider before Home reads and caches its AI access state.
  await page.goto('/');
  await expect(page).toHaveURL('/');

  // Opening a document reads its binding but must not create an empty conversation.
  const bindingResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'GET'
    && /^\/api\/product-chat\/documents\/[^/]+\/conversation$/u.test(new URL(response.url()).pathname)
  ));
  const projectId = await createFlowFromHome(page);
  expect(projectId).not.toBe('');
  const bindingResponse = await bindingResponsePromise;
  expect(bindingResponse.status()).toBe(200);
  expect(new URL(bindingResponse.url()).pathname).toBe(`/api/product-chat/documents/${projectId}/conversation`);
  expect(await bindingResponse.json()).toEqual({});

  const composer = page.getByRole('textbox', { name: 'Сообщение ассистенту', exact: true });
  await expect(composer).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть ассистента' }).click();

  await page.getByRole('button', { name: 'Open node palette' }).click();
  await page.locator('.document-node-palette-card').filter({ hasText: 'Text prompt' }).click();
  await page.getByRole('button', { name: 'Minimize node palette' }).click();
  const promptNode = page.locator('.production-node-textPrompt').last();
  await expect(promptNode).toBeVisible();
  const promptNodeId = await promptNode.getAttribute('data-node-id');
  if (!promptNodeId) throw new Error('Text prompt node must expose data-node-id.');

  const assistantShell = page.locator('.assistant-shell');
  let manualTurnRequestAllowed = false;
  let turnRequestCount = 0;
  let unexpectedTurnRequestCount = 0;
  let startRequestCount = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST'
      && new URL(request.url()).pathname === '/api/product-chat/start') startRequestCount += 1;
    if (request.method() === 'POST'
      && new URL(request.url()).pathname === '/api/chat/v1/turn/stream') {
      turnRequestCount += 1;
      if (!manualTurnRequestAllowed) unexpectedTurnRequestCount += 1;
    }
  });
  await openNodeAskAiFromOptions(page, promptNode);
  const askAiPrompt = buildNodeAskAiDraft('textPrompt');
  await expect(assistantShell).toHaveAttribute('data-open', 'true');
  await expect(composer).toBeVisible();
  await expect(composer).toHaveValue(askAiPrompt);
  await expect(messageByRole(page, 'user', askAiPrompt)).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(turnRequestCount).toBe(0);
  expect(startRequestCount).toBe(0);
  expect(unexpectedTurnRequestCount).toBe(0);

  const manualDraft = `Мой незавершённый черновик ${runId}`;
  await composer.fill(manualDraft);
  await page.getByRole('button', { name: 'Закрыть ассистента' }).click();
  await openNodeAskAiFromOptions(page, promptNode);
  await expect(composer).toHaveValue(manualDraft);
  await expect(page.getByText('Ask AI ничего не заменил.', { exact: false })).toBeVisible();
  expect(turnRequestCount).toBe(0);
  expect(startRequestCount).toBe(0);
  expect(unexpectedTurnRequestCount).toBe(0);

  const streamResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/chat/v1/turn/stream'
  ));
  const startResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/product-chat/start'
  ));
  await composer.fill(askAiPrompt);
  manualTurnRequestAllowed = true;
  await composer.press('Enter');

  const startResponse = await startResponsePromise;
  expect(startResponse.status()).toBe(200);
  expect(startResponse.request().postDataJSON()).toMatchObject({
    target: { kind: 'flow', id: projectId }, message: askAiPrompt, hasAttachments: false,
  });
  const { conversationId } = await startResponse.json() as { conversationId: string };
  expect(conversationId).toBeTruthy();
  expect(startRequestCount).toBe(1);
  const streamResponse = await streamResponsePromise;
  expect(streamResponse.status()).toBe(200);
  expect(streamResponse.headers()['content-type']).toContain('text/event-stream');
  const requestBody = streamResponse.request().postDataJSON() as {
    conversationId?: string;
    context?: { selection?: { ids?: string[] } };
    message?: string;
  };
  expect(requestBody.message).toBe(askAiPrompt);
  expect(requestBody.conversationId).toBe(conversationId);
  expect(requestBody.context?.selection?.ids).toEqual([promptNodeId]);
  expect(turnRequestCount).toBe(1);
  await expect(messageByRole(page, 'user', askAiPrompt)).toBeVisible();
  await expect(messageByRole(page, 'assistant', expectedAssistantReply)).toBeVisible();
  const savedBinding = await page.request.get(`/api/product-chat/documents/${projectId}/conversation`, {
    headers: { 'x-workspace-id': workspaces[0].id },
  });
  expect(savedBinding.status()).toBe(200);
  expect(await savedBinding.json()).toEqual({ conversationId });
  await expect(page.getByLabel(/^AI action:/u)).toHaveCount(0);
  await expect.poll(async () => {
    const stats = await readStubStats(request);
    return {
      catalogToolCallCount: stats.catalogToolCallCount - initialStubStats.catalogToolCallCount,
      completionCount: stats.completionCount - initialStubStats.completionCount,
      validatedCatalogResultCount:
        stats.validatedCatalogResultCount - initialStubStats.validatedCatalogResultCount,
    };
  }).toEqual({
    catalogToolCallCount: 1,
    completionCount: 2,
    validatedCatalogResultCount: 1,
  });

  manualTurnRequestAllowed = false;

  await page.getByRole('button', { name: 'Закрыть ассистента' }).click();
  await page.getByRole('button', { name: 'Open node palette' }).click();
  await page.locator('.document-node-palette-card').filter({ hasText: 'Banner' }).click();
  await page.getByRole('button', { name: 'Minimize node palette' }).click();
  const bannerNode = page.locator('.production-node-banner').last();
  await bannerNode.click({ button: 'right' });
  await page.getByText('Ask AI', { exact: true }).click();
  await expect(assistantShell).toHaveAttribute('data-open', 'true');
  await expect(composer).toHaveValue(buildNodeAskAiDraft('banner'));
  await page.waitForTimeout(300);
  expect(turnRequestCount).toBe(1);
  expect(startRequestCount).toBe(1);
  expect(unexpectedTurnRequestCount).toBe(0);

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}(?:\\?assistant=1)?$`, 'u'));
  // Flow creation keeps ?assistant=1, so the restored document opens its assistant itself.
  await expect(page.locator('.assistant-shell')).toHaveAttribute('data-open', 'true');
  await expect(page.getByRole('textbox', { name: 'Сообщение ассистенту', exact: true })).toBeVisible();
  await expect(messageByRole(page, 'user', askAiPrompt)).toBeVisible();
  await expect(messageByRole(page, 'assistant', expectedAssistantReply)).toBeVisible();
  await expect(page.getByLabel(/^AI action:/u)).toHaveCount(0);
  expect(startRequestCount).toBe(1);
  expect(turnRequestCount).toBe(1);
  expect(unexpectedTurnRequestCount).toBe(0);
});

async function openNodeAskAiFromOptions(page: Page, node: Locator) {
  await node.getByRole('button', { name: 'Node options' }).click();
  await page.getByText('Ask AI', { exact: true }).click();
}

async function registerAndVerify(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Имя и фамилия').fill(owner.name);
  await page.getByLabel('Email').fill(owner.email);
  await page.locator('input[name="password"]').fill(owner.password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page).toHaveURL(/\/check-email(?:\?|$)/u);

  const verificationLink = await waitForEmailLink({
    recipient: owner.email,
    subjectIncludes: 'Подтвердите email в Reverie',
    pathIncludes: '/api/auth/verify-email',
  });
  await page.goto(verificationLink);
  await expect(page).toHaveURL(/\/verify-email(?:\?|$)/u);
  await page.getByRole('link', { name: 'Перейти в продукт' }).click();
  await expect(page).toHaveURL(/\/onboarding(?:\?|$)/u);
  await completeOnboardingThroughApi(page);
}

function messageByRole(page: Page, role: 'assistant' | 'user', text: string) {
  return page.locator(`article.cm-message[data-role="${role}"]`).filter({ hasText: text });
}

interface StubStats {
  catalogToolCallCount: number;
  completionCount: number;
  validatedCatalogResultCount: number;
}

async function readStubStats(request: APIRequestContext): Promise<StubStats> {
  const response = await request.get(`${stubOrigin}/health`);
  expect(response.ok()).toBe(true);
  const body = await response.json() as Partial<StubStats>;
  expect(body).toMatchObject({
    catalogToolCallCount: expect.any(Number),
    completionCount: expect.any(Number),
    validatedCatalogResultCount: expect.any(Number),
  });
  return body as StubStats;
}
