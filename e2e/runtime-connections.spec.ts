import { randomBytes, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { CURRENT_TERMS_VERSION } from '../src/shared/auth/terms-contract';
import { getPostgresPool } from '../src/shared/db/client';
import { publishRuntimeSmokeVersion, seedRuntimeSmokePipeline } from '../scripts/runtime-v2-smoke-fixtures';
import { runtimeV2GrantSchema, type RuntimeV2Grant } from '../src/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import { runtimeV2RunRequestSchema, runtimeV2RunSchema, type RuntimeV2Run } from '../src/modules/executable-pipelines/contracts/runtime-v2-run-contracts';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('Workspace connection UI and external consumer run two pipelines, recover safely and roll back', async ({ page }, testInfo) => {
  test.skip(process.env.RUNTIME_V2_UI_E2E !== '1', 'Requires the isolated Runtime v2 preview, never a production database.');
  test.setTimeout(180_000);
  config({ path: '.env.local', quiet: true });
  config({ path: '.env', quiet: true });
  const databaseUrl = new URL(process.env.RUNTIME_V2_TEST_DATABASE_URL ?? process.env.DATABASE_URL!);
  if (!process.env.RUNTIME_V2_TEST_DATABASE_URL) databaseUrl.pathname = '/image_runtime_v2_fresh';
  expect(/^\/(?:image_)?runtime_v2_[a-z0-9_]+$/i.test(databaseUrl.pathname)).toBe(true);
  process.env.DATABASE_URL = databaseUrl.toString();
  const origin = 'http://127.0.0.1:3314';
  expect(testInfo.project.use.baseURL).toBe(origin);
  const suffix = randomBytes(8).toString('hex');
  const password = `${randomBytes(18).toString('base64url')}!Aa1`;
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'Runtime UI proof', email: `runtime-ui-${suffix}@example.test`, password,
      termsAccepted: true, termsVersion: CURRENT_TERMS_VERSION },
  });
  expect([200, 201].includes(signup.status())).toBe(true);
  const identity = await signup.json() as { user: { id: string } };
  const spaces = await page.request.get('/api/workspaces');
  expect(spaces.status()).toBe(200);
  const workspaceId = (await spaces.json()).workspaces[0].id as string;
  const actor = { kind: 'session' as const, userId: identity.user.id, workspaceId };
  const pipeline = await seedRuntimeSmokePipeline(actor, 'content.ui-summary');
  let initialKey = '';
  let rotatedKey = '';
  let clientId = '';
  page.on('dialog', (dialog) => void dialog.accept());

  await page.goto('/settings/integrations');
  await expect(page.getByRole('heading', { name: 'Подключения', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Подключить приложение', exact: true }).click();
  await page.getByLabel('ID рабочего пространства в подключаемом приложении').fill(`content-ui-${suffix}`);
  const clientCreated = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/runtime-connections/clients'));
  await page.getByRole('button', { name: 'Создать подключение', exact: true }).click();
  clientId = (await (await clientCreated).json()).client.id;
  await expect(page.getByText('Шаг 2. Разрешите нужные pipelines ниже.', { exact: false })).toBeVisible();

  const firstIssued = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith(`/clients/${clientId}/credentials`));
  await page.getByRole('button', { name: 'Выпустить ключ', exact: true }).click();
  initialKey = (await (await firstIssued).json()).token;
  await expect(page.getByRole('region', { name: 'Новый ключ показан один раз' })).toBeVisible();
  const localValues = await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].join('\n'));
  expect(localValues.includes(initialKey)).toBe(false);
  await page.getByRole('button', { name: 'Ключ сохранён, закрыть' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Выпустить ключ для замены' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Новый ключ показан один раз' })).toHaveCount(0);

  const nextIssued = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith(`/clients/${clientId}/credentials`));
  await page.getByLabel('Название нового ключа').fill('Ключ для замены');
  await page.getByRole('button', { name: 'Выпустить ключ для замены' }).click();
  rotatedKey = (await (await nextIssued).json()).token;
  await page.getByRole('button', { name: 'Ключ сохранён, закрыть' }).click();
  for (const token of [initialKey, rotatedKey]) {
    expect((await page.request.get('/v2/runtime/client', { headers: { authorization: `Bearer ${token}` } })).status()).toBe(200);
  }
  await page.locator('li').filter({ has: page.getByText('Основной ключ', { exact: true }) }).getByRole('button', { name: 'Отозвать' }).click();
  await expect(page.getByText('Ключ отозван. Другие ключи подключения продолжают работать.', { exact: true })).toBeVisible();
  expect((await page.request.get('/v2/runtime/client', { headers: { authorization: `Bearer ${initialKey}` } })).status()).toBe(401);
  expect((await page.request.get('/v2/runtime/client', { headers: { authorization: `Bearer ${rotatedKey}` } })).status()).toBe(200);
  await page.getByRole('button', { name: 'Отключить', exact: true }).click();
  await expect(page.getByText('Подключение отключено', { exact: true })).toBeVisible();
  expect((await page.request.get('/v2/runtime/client', { headers: { authorization: `Bearer ${rotatedKey}` } })).status()).toBe(403);
  await page.getByRole('button', { name: 'Включить', exact: true }).click();
  await expect(page.getByText('Подключение включено', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByRole('combobox', { name: 'Опубликованный pipeline', exact: true }).selectOption(pipeline.publicId);
  await expect(page.getByRole('combobox', { name: 'Версия', exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Разрешить выбранную версию' }).click();
  const grantHeading = page.getByRole('heading', { name: 'content.ui-summary', exact: true });
  await expect(grantHeading).toBeVisible();
  const grantCard = grantHeading.locator('..').locator('..').locator('..');
  await grantCard.getByText('Проверить версию 1', { exact: true }).click();
  await grantCard.getByLabel('Входные данные (JSON)').fill('{"text":"UI deterministic proof"}');
  const submissions: Array<{ key: string | undefined; body: string | null }> = [];
  await page.route('**/runtime-connections/clients/*/grants/*/runs', async (route) => {
    submissions.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
    if (submissions.length === 1) {
      await route.fetch(); // The server accepts it; simulate a lost acknowledgement, not a failed run.
      await route.abort('failed');
    } else await route.continue();
  });
  await grantCard.getByRole('button', { name: 'Запустить один тест' }).click();
  await grantCard.getByRole('button', { name: 'Восстановить текущий запуск' }).click();
  await expect(grantCard.getByText('v1: UI deterministic proof', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(grantCard.getByText('Стоимость подтверждена: $0.00000000', { exact: true })).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[0]).toEqual(submissions[1]);
  await page.unroute('**/runtime-connections/clients/*/grants/*/runs');

  await publishRuntimeSmokeVersion(actor, pipeline.pipelineId, pipeline.capabilityKey, 2);
  await page.reload();
  await expect(page.getByText('Доступна версия 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Создать отдельное разрешение для проверки' }).click();
  await expect(page.getByRole('heading', { name: 'content.ui-summary', exact: true })).toHaveCount(2);
  const candidate = page.getByRole('heading', { name: 'content.ui-summary', exact: true })
    .locator('..').locator('..').locator('..').filter({ has: page.getByText('Версия 2 · разрешён', { exact: true }) });
  await candidate.getByText('Проверить версию 2', { exact: true }).click();
  await candidate.getByLabel('Входные данные (JSON)').fill('{"text":"Candidate proof"}');
  await candidate.getByRole('button', { name: 'Запустить один тест' }).click();
  await expect(candidate.getByText('v2: Candidate proof', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Версия 1 · разрешён', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Закрепить версию 2', exact: true }).click();
  const rollback = page.getByRole('combobox', { name: 'Вернуться к прежней версии', exact: true });
  await expect(rollback).toBeVisible();
  await rollback.selectOption('1');
  await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
  await expect(page.getByText('Версия 1 · разрешён', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: testInfo.outputPath('runtime-connections-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Подключения', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('runtime-connections-mobile.png'), fullPage: true });

  const secondPipeline = await seedRuntimeSmokePipeline(actor, 'content.external-text');
  const secondGrantResponse = await page.request.post(`/api/workspaces/${workspaceId}/runtime-connections/clients/${clientId}/grants`, {
    headers: { origin },
    data: { pipeline: secondPipeline.publicId, capabilityKey: secondPipeline.capabilityKey,
      version: secondPipeline.version.version, checksum: secondPipeline.version.checksum,
      inputSchemaChecksum: secondPipeline.version.inputSchemaChecksum, outputSchemaChecksum: secondPipeline.version.outputSchemaChecksum,
      updatePolicy: 'PINNED', executionPolicy: { maxAttempts: 1 },
      costPolicy: { maximumProviderCostUsd: '0.00000000', mode: 'STRICT' } },
  });
  expect(secondGrantResponse.status()).toBe(201);
  const secondGrant = z.object({ grant: runtimeV2GrantSchema }).strict().parse(await secondGrantResponse.json()).grant;
  expect(rotatedKey.startsWith('rvr_client_')).toBe(true);
  // No browser cookie jar: all following calls use only this one external-service key.
  const externalList = z.object({ grants: z.array(runtimeV2GrantSchema) }).strict().parse(
    await externalRuntimeHttp(origin, rotatedKey, 'grants'),
  );
  const original = externalList.grants.find((grant) => grant.pipelinePublicId === pipeline.publicId && grant.pinned.version === 1);
  expect(Boolean(original)).toBe(true);
  expect(externalList.grants.some((grant) => grant.id === secondGrant.id)).toBe(true);
  expect(original!.pipelinePublicId === secondGrant.pipelinePublicId).toBe(false);
  const externalRuns = await Promise.all([
    runExternalPipeline(origin, rotatedKey, original!, 'External summary proof'),
    runExternalPipeline(origin, rotatedKey, secondGrant, 'External second pipeline proof'),
  ]);
  expect(externalRuns.every((run) => run.serviceClientId === clientId)).toBe(true);
  expect(externalRuns[0].id === externalRuns[1].id).toBe(false);
  await testInfo.attach('runtime-v2-external-http-evidence', {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify({ transport: 'HTTP', authentication: 'one-service-credential-no-session-cookie',
      runs: externalRuns.map((run) => ({ runId: run.id, publicId: run.pipeline.publicId, grantId: run.grantId,
        version: run.pipeline.version, status: run.status, actualProviderCostUsd: run.usage.actualProviderCostUsd,
        providerCallCount: run.usage.providerCallCount })) }, null, 2)),
  });
  await getPostgresPool().end();
});

async function externalRuntimeHttp(origin: string, token: string, path: string, body?: unknown, idempotencyKey?: string) {
  const response = await fetch(`${origin}/v2/runtime/${path}`, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  expect(response.status).toBe(body === undefined ? 200 : 202);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  return response.json() as Promise<unknown>;
}

async function runExternalPipeline(origin: string, token: string, grant: RuntimeV2Grant, input: string): Promise<RuntimeV2Run> {
  const body = runtimeV2RunRequestSchema.parse({ input: { text: input }, expectedGrantRevision: grant.revision,
    maximumProviderCostUsd: '0.00000000', correlationId: randomUUID(), consumerReference: { test: 'external-consumer-smoke' } });
  const key = randomUUID();
  const accepted = runtimeV2RunSchema.parse(await externalRuntimeHttp(origin, token, `grants/${grant.id}/runs`, body, key));
  expect(accepted.idempotentReplay).toBe(false);
  const replayed = runtimeV2RunSchema.parse(await externalRuntimeHttp(origin, token, `grants/${grant.id}/runs`, body, key));
  expect(replayed.id).toBe(accepted.id);
  expect(replayed.idempotentReplay).toBe(true);
  let completed = accepted;
  await expect.poll(async () => {
    completed = runtimeV2RunSchema.parse(await externalRuntimeHttp(origin, token, `runs/${accepted.id}`));
    return completed.status;
  }, { timeout: 45_000, intervals: [300, 500, 1000] }).toBe('succeeded');
  expect(completed.grantId).toBe(grant.id);
  expect(completed.grantRevision).toBe(grant.revision);
  expect(completed.pipeline).toEqual({ publicId: grant.pipelinePublicId, capabilityKey: grant.capabilityKey,
    version: grant.pinned.version, checksum: grant.pinned.checksum,
    inputSchemaChecksum: grant.pinned.inputSchemaChecksum, outputSchemaChecksum: grant.pinned.outputSchemaChecksum });
  expect(completed.outputs).toEqual({ result: `v${grant.pinned.version}: ${input}` });
  expect(completed.correlationId).toBe(body.correlationId);
  expect(completed.consumerReference).toEqual(body.consumerReference);
  expect(completed.usage.state).toBe('COMPLETE');
  expect(completed.usage.actualProviderCostUsd).toBe('0.00000000');
  expect(completed.usage.knownProviderCostUsd).toBe('0.00000000');
  expect(completed.usage.providerCallCount).toBe(0);
  expect(completed.usage.pricedCallCount).toBe(0);
  expect(completed.cost.mode).toBe('STRICT');
  expect(completed.cost.enforcement).toBe('ENFORCED');
  expect(completed.cost.effectiveMaximumProviderCostUsd).toBe('0.00000000');
  expect(completed.cost.hasProviderCalls).toBe(false);
  return completed;
}
