import { expect, test, type Page } from '@playwright/test';
import { waitForEmailLink } from '../scripts/mailpit-client';

const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const owner = {
  email: `e2e-owner-${runId}@example.test`,
  name: 'E2E Owner',
  password: 'E2eOwnerPass!2026',
  resetPassword: 'E2eOwnerReset!2026',
};
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('verified user persists a private image and can reset the password', async ({ page }) => {
  let projectId = '';
  let uploadedAssetId = '';

  await test.step('register and verify the email through Mailpit', async () => {
    await page.goto('/register');
    await page.getByLabel('Имя и фамилия').fill(owner.name);
    await page.getByLabel('Email').fill(owner.email);
    await page.locator('input[name="password"]').fill(owner.password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click();

    await expect(page).toHaveURL(/\/check-email(?:\?|$)/u);
    await expect(page.getByRole('button', { name: 'Отправить письмо ещё раз' })).toBeVisible();

    await page.goto('/login');
    await fillLogin(page, owner.email, owner.password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/check-email\?email=/u);

    const verificationLink = await waitForEmailLink({
      recipient: owner.email,
      subjectIncludes: 'Подтвердите email в Reverie',
      pathIncludes: '/api/auth/verify-email',
    });
    await page.goto(verificationLink);
    await expect(page).toHaveURL(/\/verify-email(?:\?|$)/u);
    await page.getByRole('link', { name: 'Перейти в продукт' }).click();
    await expect(page).toHaveURL('/');
  });

  await test.step('create a document', async () => {
    await expect(page.getByRole('button', { name: 'Create New' }).first()).toBeEnabled();
    await page.getByRole('button', { name: 'Create New' }).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/?#]+$/u);
    projectId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
    expect(projectId).not.toBe('');
  });

  await test.step('upload, autosave and reload an S3-backed image', async () => {
    const importNode = page.locator('.production-node-importImage').first();
    await expect(importNode).toBeVisible();

    const autosaveResponsePromise = waitForDocumentAutosave(page, projectId);
    const uploadResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && response.url().includes('/api/assets/images')
    ));
    await importNode.locator('input[type="file"]').setInputFiles({
      name: `critical-${runId}.png`,
      mimeType: 'image/png',
      buffer: onePixelPng,
    });

    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(201);
    const uploadPayload = await uploadResponse.json() as { asset?: { id?: string; status?: string } };
    uploadedAssetId = uploadPayload.asset?.id ?? '';
    expect(uploadPayload.asset?.status).toBe('ready');
    expect(uploadedAssetId).not.toBe('');

    await expect(importNode.getByAltText('Reference preview')).toBeVisible();
    await autosaveResponsePromise;

    await page.reload();
    await expect(page.locator('.production-node-importImage').first().getByAltText('Reference preview')).toBeVisible();
    const contentResponse = await page.request.get(`/api/assets/${uploadedAssetId}/content`);
    expect(contentResponse.status()).toBe(200);
    expect(await contentResponse.body()).toEqual(onePixelPng);
  });

  await test.step('sign out and sign back in', async () => {
    await signOutFromWorkspace(page);
    await signIn(page, owner.email, owner.password);
    await expect(page.getByRole('button', { name: owner.name })).toBeVisible();
  });

  await test.step('reset the password through Mailpit and reject the old password', async () => {
    await signOutFromWorkspace(page);
    await page.getByRole('link', { name: 'Забыли пароль?' }).click();
    await expect(page).toHaveURL(/\/forgot-password(?:\?|$)/u);
    await page.getByLabel('Email').fill(owner.email);
    await page.getByRole('button', { name: 'Отправить ссылку' }).click();

    const resetLink = await waitForEmailLink({
      recipient: owner.email,
      subjectIncludes: 'Сбросьте пароль в Reverie',
      pathIncludes: '/api/auth/reset-password/',
    });
    await page.goto(resetLink);
    await expect(page).toHaveURL(/\/reset-password\?token=/u);
    await page.locator('input[name="new-password"]').fill(owner.resetPassword);
    await page.locator('input[name="password-confirmation"]').fill(owner.resetPassword);
    await page.getByRole('button', { name: 'Сохранить новый пароль' }).click();
    await expect(page.getByRole('heading', { name: 'Пароль изменён' })).toBeVisible();

    await page.goto('/login');
    await fillLogin(page, owner.email, owner.password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.locator('.auth-form-error')).toBeVisible();
    await expect(page).toHaveURL(/\/login(?:\?|$)/u);

    await page.locator('input[name="password"]').fill(owner.resetPassword);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: owner.name })).toBeVisible();
  });
});

async function fillLogin(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name="password"]').fill(password);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await fillLogin(page, email, password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL('/');
}

async function signOutFromWorkspace(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: owner.name }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/u);
}

async function waitForDocumentAutosave(page: Page, projectId: string) {
  const saved = await page.waitForResponse((response) => (
    response.request().method() === 'PATCH'
    && new URL(response.url()).pathname === `/api/projects/${projectId}`
    && response.status() === 200
  ), { timeout: 20_000 });
  expect(saved.status()).toBe(200);
}
