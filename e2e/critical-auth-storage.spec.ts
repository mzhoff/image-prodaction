import { expect, test, type Page } from '@playwright/test';
import { waitForEmailLink } from '../scripts/mailpit-client';
import { completeOnboardingThroughUi, createFlowFromHome, dismissSectionGuide } from './release-user-fixture';

test.use({ locale: 'ru-RU' });

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

test('verified user persists a private image and can reset the password', async ({ page, request }) => {
  test.setTimeout(180_000);
  let projectId = '';
  let uploadedAssetId = '';
  let workspaceId = '';

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
    await completeOnboardingThroughUi(page, owner.name);
  });

  await test.step('create a document', async () => {
    projectId = await createFlowFromHome(page);
    expect(projectId).not.toBe('');

    const projectResponse = await page.request.get(`/api/projects/${projectId}`);
    expect(projectResponse.status()).toBe(200);
    const projectPayload = await projectResponse.json() as {
      project?: { workspaceId?: string };
    };
    workspaceId = projectPayload.project?.workspaceId ?? '';
    expect(workspaceId).not.toBe('');
  });

  await test.step('upload, autosave and reload an S3-backed image', async () => {
    await expect(page.getByRole('textbox', { name: 'Pipeline name' })).toHaveValue('Новый Flow');
    const closeAssistant = page.getByRole('button', { name: 'Закрыть ассистента' });
    await expect(closeAssistant).toBeVisible();
    await closeAssistant.click();

    await page.getByRole('button', { name: 'Open node palette' }).click();
    const nodeAutosaveResponsePromise = waitForDocumentAutosave(page, projectId);
    await page
      .getByRole('complementary', { name: 'Document tools' })
      .getByRole('button', { name: 'Import', exact: true })
      .click();

    const importNode = page.locator('.production-node-importImage').first();
    await expect(importNode).toBeVisible();
    await nodeAutosaveResponsePromise;

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
    expect(uploadResponse.status()).toBe(202);
    const uploadPayload = await uploadResponse.json() as AcceptedImageUpload;
    uploadedAssetId = uploadPayload.asset.id;
    expect(uploadPayload.asset.status).toBe('pending');
    await waitForReadyImage(page, uploadPayload);
    expect(uploadedAssetId).not.toBe('');

    await expect(importNode.getByAltText('Reference preview')).toBeVisible();
    await autosaveResponsePromise;

    await page.reload();
    await expect(page.locator('.production-node-importImage').first().getByAltText('Reference preview')).toBeVisible();
    const contentResponse = await page.request.get(`/api/assets/${uploadedAssetId}/content`);
    expect(contentResponse.status()).toBe(200);
    expect(await contentResponse.body()).toEqual(onePixelPng);
    // A fresh HTTP context has no owner cookie: a private file must stay inaccessible.
    expect((await request.get(`/api/assets/${uploadedAssetId}/content`)).status()).toBe(401);
  });

  await test.step('sign out and sign back in', async () => {
    await signOutFromWorkspace(page);
    await signIn(page, owner.email, owner.password);
    await expect(page.getByRole('button', { name: `Аккаунт: ${owner.name}`, exact: true })).toBeVisible();
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
    await expect(page.getByRole('button', { name: `Аккаунт: ${owner.name}`, exact: true })).toBeVisible();
  });

  await test.step('close settings in one action after navigating between sections', async () => {
    await page.getByRole('button', { name: `Аккаунт: ${owner.name}`, exact: true }).click();
    await page.getByRole('dialog', { name: 'Ваш аккаунт' }).getByRole('link', { name: /Личные данные/u }).click();
    await expect(page).toHaveURL('/settings/account');
    await dismissSectionGuide(page, 'settings');
    const settings = page.getByRole('dialog', { name: 'Настройки', exact: true });
    await expect(settings).toBeVisible();
    const navigation = settings.getByRole('navigation', { name: 'Разделы настроек' });
    await navigation.getByRole('link', { name: 'AI и баланс', exact: true }).click();
    await expect(page).toHaveURL('/settings/providers');
    await navigation.getByRole('link', { name: 'Профиль', exact: true }).click();
    await expect(page).toHaveURL('/settings/account');
    await navigation.getByRole('link', { name: 'Безопасность', exact: true }).click();
    await expect(page).toHaveURL('/settings/security');
    await navigation.getByRole('link', { name: 'Профиль', exact: true }).click();
    await expect(page).toHaveURL('/settings/account');
    await navigation.getByRole('link', { name: 'Безопасность', exact: true }).click();
    await expect(page).toHaveURL('/settings/security');

    await page.getByRole('button', { name: 'Закрыть настройки' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('dialog', { name: 'Настройки' })).toHaveCount(0);
  });

  await test.step('browse a filtered Library sequence and close the viewer in one action', async () => {
    const filterPrefix = `library-filter-${runId}`;
    const firstName = `${filterPrefix}-a.png`;
    const secondName = `${filterPrefix}-b.png`;
    const hiddenTechnicalName = `technical-hidden-${runId}.png`;

    await uploadImageThroughApi(page, {
      documentId: projectId,
      name: firstName,
      origin: 'uploaded',
      workspaceId,
    });
    await uploadImageThroughApi(page, {
      documentId: projectId,
      name: secondName,
      origin: 'uploaded',
      workspaceId,
    });
    const rejectedTechnicalUpload = await page.request.post('/api/assets/images', {
      headers: { Origin: new URL(page.url()).origin },
      multipart: {
        documentId: projectId,
        file: {
          name: hiddenTechnicalName,
          mimeType: 'image/png',
          buffer: onePixelPng,
        },
        workspaceId,
      },
    });
    expect(rejectedTechnicalUpload.status()).toBe(400);

    await page.goto('/library');
    await expect(page).toHaveURL('/library');
    await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
    await dismissSectionGuide(page, 'library');
    await expect(page.getByRole('region', { name: 'Фильтры библиотеки' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
    const filters = page.getByRole('region', { name: 'Фильтры библиотеки' });
    for (const name of ['Источник', 'Тип медиа', 'Модель', 'Проект']) {
      await expect(filters.getByRole('combobox', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByText('Templates', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Tutorials', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: `Открыть ${hiddenTechnicalName}` })).toHaveCount(0);

    await page.getByRole('button', { name: 'Поиск по библиотеке', exact: true }).click();
    const search = page.getByRole('dialog', { name: 'Поиск в Workspace' });
    await search.getByRole('searchbox', { name: 'Найти файлы в Workspace' }).fill(filterPrefix);
    await search.getByRole('button', { name: 'Фильтры', exact: true }).click();
    await search.getByRole('button', { name: 'Показать в библиотеке', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/library\\?q=${encodeURIComponent(filterPrefix)}$`, 'u'));

    const filteredLinks = page.getByRole('link', {
      name: new RegExp(`^Открыть ${escapeRegExp(filterPrefix)}-[ab]\\.png$`, 'u'),
    });
    await expect(filteredLinks).toHaveCount(2);
    const filteredThumbnails = filteredLinks.locator('img');
    await expect(filteredThumbnails).toHaveCount(2);
    await expect.poll(() => filteredThumbnails.evaluateAll((images) => (
      images.every((image) => image instanceof HTMLImageElement && image.naturalWidth > 0)
    ))).toBe(true);
    const filteredHrefs = await filteredLinks.evaluateAll((elements) => (
      elements.map((element) => element.getAttribute('href') ?? '')
    ));
    const filteredAssetIds = filteredHrefs.map((href) => (
      href.split('?', 1)[0]?.split('/').at(-1) ?? ''
    ));
    expect(filteredAssetIds).toHaveLength(2);
    expect(filteredAssetIds.every(Boolean)).toBe(true);

    await filteredLinks.first().click();
    await expect(page).toHaveURL(
      new RegExp(`/library/${filteredAssetIds[0]}\\?q=${encodeURIComponent(filterPrefix)}$`, 'u'),
    );
    await expect(page.getByRole('dialog', { name: 'Image viewer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous generated image' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next generated image' })).toBeVisible();
    const previewImage = page.getByRole('dialog', { name: 'Image viewer' }).locator('.image-viewer-media');
    await expect(previewImage).toBeVisible();
    await expect.poll(() => previewImage.evaluate((image) => (
      image instanceof HTMLImageElement ? image.naturalWidth : 0
    ))).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Next generated image' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/library/${filteredAssetIds[1]}\\?q=${encodeURIComponent(filterPrefix)}$`, 'u'),
    );

    await page.getByRole('dialog', { name: 'Image viewer' }).locator('.image-viewer-close').click();
    await expect(page).toHaveURL(new RegExp(`/library\\?q=${encodeURIComponent(filterPrefix)}$`, 'u'));
    await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
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
  await page.getByRole('button', { name: `Аккаунт: ${owner.name}`, exact: true }).click();
  await page.getByRole('dialog', { name: 'Ваш аккаунт' }).getByRole('button', { name: 'Выйти', exact: true }).click();
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

async function uploadImageThroughApi(
  page: Page,
  input: {
    documentId: string;
    name: string;
    origin: 'uploaded' | 'saved';
    workspaceId: string;
  },
) {
  const multipart: Record<string, string | {
    buffer: Buffer;
    mimeType: string;
    name: string;
  }> = {
    documentId: input.documentId,
    file: {
      name: input.name,
      mimeType: 'image/png',
      buffer: onePixelPng,
    },
    workspaceId: input.workspaceId,
  };
  multipart.origin = input.origin;

  const response = await page.request.post('/api/assets/images', {
    headers: { Origin: new URL(page.url()).origin }, multipart,
  });
  expect(response.status()).toBe(202);
  const accepted = await response.json() as AcceptedImageUpload;
  expect(accepted.asset.status).toBe('pending');
  const payload = await waitForReadyImage(page, accepted);
  expect(payload.asset.status).toBe('ready');
  expect(payload.asset?.origin).toBe(input.origin);
  expect(payload.asset?.libraryVisible).toBe(true);
  expect(payload.asset?.id).toBeTruthy();
  return payload.asset?.id ?? '';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

interface AcceptedImageUpload {
  asset: { id: string; status: string; origin?: string; libraryVisible?: boolean };
  job: { id: string; status: string };
  statusUrl: string;
}

async function waitForReadyImage(page: Page, accepted: AcceptedImageUpload) {
  expect(accepted.job.id).toMatch(/^[0-9a-f-]{36}$/iu);
  expect(accepted.statusUrl).toBe(`/api/generation-jobs/${accepted.job.id}`);
  let ready: AcceptedImageUpload | undefined;
  await expect.poll(async () => {
    const response = await page.request.get(accepted.statusUrl);
    expect(response.status()).toBe(200);
    const payload = await response.json() as AcceptedImageUpload;
    if (payload.job.status === 'succeeded') ready = payload;
    return payload.job.status;
  }, { timeout: 45_000, intervals: [250, 500, 1000] }).toBe('succeeded');
  expect(ready?.asset).toMatchObject({ id: accepted.asset.id, status: 'ready' });
  return ready!;
}
