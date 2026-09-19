import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { getDb, getPostgresPool } from '../src/shared/db/client.ts';
import { user } from '../src/shared/db/schema/auth.ts';
import { handleBudgetProjection } from '../src/app/api-routes/platform/budget-connection.ts';
import { connectOpenRouterProvider, disconnectOpenRouterProvider, listWorkspaceProviderConnections, validateStoredOpenRouterProvider, resolveOpenRouterCredential } from '../src/modules/provider-connections/server/provider-connection-service.ts';
import { withPaidCredential } from '../src/modules/provider-connections/server/paid-request-guard.ts';

assert.match(new URL(process.env.DATABASE_URL ?? '').pathname, /^\/image_budget_test_[a-f0-9]+$/);
const issuer = process.env.REVERIE_IDENTITY_ISSUER!, secret = process.env.PLATFORM_PROJECTION_SECRET!;
const apiKey = 'fake-valid-credential';
const subject = randomUUID(), localId = randomUUID();
await getDb().insert(user).values({ id: localId, name: 'Pilot owner', email: null,
  identitySubject: `${issuer}#${subject}`, termsAcceptedAt: new Date(), termsVersion: 'test' });
async function project(input: object, signatureValid = true) {
  const body = JSON.stringify(input), timestamp = String(Date.now());
  const signature = createHmac('sha256', secret).update(`${timestamp}\nPOST\n/v1/platform/budget-connection\n${body}`).digest('hex');
  return handleBudgetProjection(new Request('https://production.example.test/v1/platform/budget-connection', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-platform-timestamp': timestamp,
      'x-platform-signature': signatureValid ? signature : '0'.repeat(64) }, body,
  }));
}
try {
  const payload = { issuer, subject, apiKey, keyHash: 'managed-1' };
  assert.equal((await project(payload, false)).status, 403);
  assert.equal((await project({ ...payload, subject: 'unknown' })).status, 409);
  const first = await project(payload); assert.equal(first.status, 200);
  const { workspaceId } = await first.json() as { workspaceId: string };
  assert.ok(workspaceId);
  assert.equal((await project(payload)).status, 200);
  assert.equal((await project({ ...payload, keyHash: 'managed-2' })).status, 409);
  assert.equal((await project({ ...payload, issuer: 'https://evil.test' })).status, 400);
  assert.equal((await resolveOpenRouterCredential(localId, workspaceId)).apiKey, apiKey);
  await assert.rejects(resolveOpenRouterCredential('outsider', workspaceId), /access denied/i);
  await validateStoredOpenRouterProvider(localId, workspaceId);
  const connections = await listWorkspaceProviderConnections(localId, workspaceId);
  assert.equal(connections.providers[0].canManage, false);
  assert.equal(connections.providers[0].managedByPlatform, true);
  await assert.rejects(connectOpenRouterProvider({ userId: localId, workspaceId, apiKey }), /платформа/);
  await assert.rejects(disconnectOpenRouterProvider(localId, workspaceId), /платформа/);
  const db = getPostgresPool();
  assert.equal((await db.query('SELECT count(*) FROM workspace_provider_credential')).rows[0].count, '1');
  assert.equal((await db.query('SELECT count(*) FROM workspace')).rows[0].count, '1');
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let entered!: () => void;
  const inside = new Promise<void>((resolve) => { entered = resolve; });
  const firstPaid = withPaidCredential(apiKey, async () => { entered(); await blocked; return 'first'; });
  await inside;
  await assert.rejects(withPaidCredential(apiKey, async () => 'must not run'), /уже выполняется/);
  assert.equal(await withPaidCredential('another-child-key', async () => 'independent'), 'independent');
  release(); assert.equal(await firstPaid, 'first');
  await assert.rejects(withPaidCredential(apiKey, async () => { throw new Error('provider failure'); }), /provider failure/);
  assert.equal(await withPaidCredential(apiKey, async () => 'recovered'), 'recovered');
  console.info('Platform projection and cross-process paid-request guard: passed');
} finally { await getPostgresPool().end(); }
