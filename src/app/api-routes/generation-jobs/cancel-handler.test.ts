import assert from 'node:assert/strict';
import test from 'node:test';
import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import { toPublicGenerationJob } from '@/modules/generation/server/generation-submission-service';
import { createCancelGenerationJobHandler } from './cancel-handler';

const jobId = '01900000-0000-7000-8000-000000000001';
function fixture() {
  const calls: string[] = [];
  const dependencies: Parameters<typeof createCancelGenerationJobHandler>[0] = {
    trustedOrigins: () => ['http://127.0.0.1:7310', 'https://studio.example'],
    userId: async () => { calls.push('session'); return 'session-author'; },
    cancel: async (userId, id) => { calls.push('cancel'); assert.equal(userId, 'session-author'); assert.equal(id, jobId);
      return { id, status: 'canceled', usage: {}, error: null } as GenerationJobDto; },
    toPublic: toPublicGenerationJob,
    toErrorResponse: (error) => Response.json({ error: 'denied' }, { status: (error as { status: number }).status || 500 }),
  };
  return { dependencies, calls };
}
function request(origin?: string) {
  return new Request(`http://internal/api/generation-jobs/${jobId}/cancel`, { method: 'POST', headers: origin ? { Origin: origin } : {} });
}

test('cancel rejects absent/foreign/null origins before session or mutation, including same-site foreign ports', async () => {
  const setup = fixture(); const cancel = createCancelGenerationJobHandler(setup.dependencies);
  for (const origin of [undefined, 'https://evil.example', 'null', 'http://127.0.0.1:9999']) assert.equal((await cancel(request(origin), jobId)).status, 403);
  assert.deepEqual(setup.calls, []);
});

test('trusted proxy origin uses server session identity and returns private terminal job', async () => {
  const setup = fixture();
  const response = await createCancelGenerationJobHandler(setup.dependencies)(request('http://127.0.0.1:7310'), jobId);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(setup.calls, ['session', 'cancel']);
  assert.equal((await response.json()).job.status, 'canceled');
});

test('trusted-origin cancellation still requires authentication and an accessible workspace job', async () => {
  for (const status of [401, 403]) {
    const setup = fixture();
    if (status === 401) setup.dependencies.userId = async () => { throw Object.assign(new Error('Session required.'), { status }); };
    else setup.dependencies.cancel = async () => { throw Object.assign(new Error('Workspace denied.'), { status }); };
    assert.equal((await createCancelGenerationJobHandler(setup.dependencies)(request('https://studio.example'), jobId)).status, status);
  }
});
