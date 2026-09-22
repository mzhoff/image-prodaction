import assert from 'node:assert/strict';
import test from 'node:test';
import { createUuidV7 } from '@/shared/lib/id';
import { WorkspaceCreateConflict } from '@/entities/workspace/server/create-team-workspace';
import { handleCreateWorkspace } from './create';

const input = { name: '  Студия  ', creationId: createUuidV7() };
const request = (body: unknown = input, origin = 'https://production.test') => new Request('https://production.test/api/workspaces', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const ports = {
  session: async () => ({ user: { id: 'authenticated-owner' } }),
  origins: () => ['https://production.test'],
  create: async (userId: string, value: typeof input) => {
    assert.equal(userId, 'authenticated-owner');
    assert.deepEqual(value, { ...input, name: 'Студия' });
    return { id: value.creationId, name: value.name };
  },
};

test('workspace creation binds owner to the session and trims its name', async () => {
  const response = await handleCreateWorkspace(request(), ports);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { workspace: { id: input.creationId, name: 'Студия' } });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('untrusted, anonymous and forged workspace creation never reaches persistence', async () => {
  const blocked = { ...ports, create: async () => { throw new Error('Persistence must not be called'); } };
  assert.equal((await handleCreateWorkspace(request(input, 'https://evil.test'), blocked)).status, 403);
  assert.equal((await handleCreateWorkspace(request(), { ...blocked, session: async () => null })).status, 401);
  for (const body of [null, { ...input, name: ' ' }, { ...input, name: 'x'.repeat(121) }, { ...input, userId: 'other' }, { ...input, role: 'owner' }, { ...input, creationId: 'invalid' }]) {
    assert.equal((await handleCreateWorkspace(request(body), blocked)).status, 400);
  }
});

test('creation conflicts are explicit and unexpected errors do not reveal server details', async () => {
  assert.equal((await handleCreateWorkspace(request(), { ...ports, create: async () => { throw new WorkspaceCreateConflict(); } })).status, 409);
  const response = await handleCreateWorkspace(request(), { ...ports, create: async () => { throw new Error('secret db detail'); } });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret db detail/);
});
