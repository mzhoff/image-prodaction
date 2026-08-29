import { expect, test, type Page } from '@playwright/test';
import { waitForEmailLink } from '../scripts/mailpit-client';

const expectedAssistantReply = 'CHATMODULE_CI_OK';
const stubGateEnabled = process.env.E2E_CHAT_STUB === 'true';
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const owner = {
  email: `e2e-chat-${runId}@example.test`,
  name: 'E2E Chat Owner',
  password: 'E2eChatPass!2026',
};

test('ChatModule streams one free stub turn and restores it after reload', async ({ page }) => {
  test.skip(!stubGateEnabled, 'Set E2E_CHAT_STUB=true only with the local OpenRouter stub.');
  await registerAndVerify(page);

  await expect(page.getByRole('button', { name: 'Create New' }).first()).toBeEnabled();
  await page.getByRole('button', { name: 'Create New' }).first().click();
  await expect(page).toHaveURL(/\/projects\/[^/?#]+$/u);
  const projectId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  expect(projectId).not.toBe('');

  const composer = page.getByPlaceholder('Напишите задачу для ассистента...');
  await expect(composer).toBeVisible();

  const userPrompt = `ChatModule browser gate ${runId}`;
  const streamResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/chat/v1/turn/stream'
  ));
  const bindingResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'PUT'
    && new URL(response.url()).pathname === `/api/product-chat/documents/${projectId}/conversation`
  ));

  await composer.fill(userPrompt);
  await composer.press('Enter');

  const streamResponse = await streamResponsePromise;
  expect(streamResponse.status()).toBe(200);
  expect(streamResponse.headers()['content-type']).toContain('text/event-stream');
  await expect(messageByRole(page, 'user', userPrompt)).toBeVisible();
  await expect(messageByRole(page, 'assistant', expectedAssistantReply)).toBeVisible();
  await expect(page.getByLabel(/^AI action:/u)).toHaveCount(0);

  const bindingResponse = await bindingResponsePromise;
  expect(bindingResponse.status()).toBe(200);

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`, 'u'));
  await expect(page.getByPlaceholder('Напишите задачу для ассистента...')).toBeVisible();
  await expect(messageByRole(page, 'user', userPrompt)).toBeVisible();
  await expect(messageByRole(page, 'assistant', expectedAssistantReply)).toBeVisible();
  await expect(page.getByLabel(/^AI action:/u)).toHaveCount(0);
});

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
  await expect(page).toHaveURL('/');
}

function messageByRole(page: Page, role: 'assistant' | 'user', text: string) {
  return page.locator(`article.cm-message[data-role="${role}"]`).filter({ hasText: text });
}
