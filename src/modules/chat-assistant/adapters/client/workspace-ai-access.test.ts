import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWorkspaceAiAccess } from './workspace-ai-access';

test('preflight distinguishes missing, invalid, connected and unknown without querying provider usage', async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  let body: unknown = { providers: [{ provider: 'openrouter', status: 'disconnected' }] };
  let status = 200;
  globalThis.fetch = (async (url) => {
    requests.push(String(url));
    return Response.json(body, { status });
  }) as typeof fetch;
  try {
    assert.equal((await fetchWorkspaceAiAccess('workspace-1')).status, 'not-activated');
    body = { providers: [{ provider: 'openrouter', status: 'invalid' }] };
    assert.equal((await fetchWorkspaceAiAccess('workspace-1')).status, 'unavailable');
    body = { providers: [{ provider: 'openrouter', status: 'connected' }] };
    assert.deepEqual(await fetchWorkspaceAiAccess('workspace-1'), { status: 'connected' });
    body = { providers: [] };
    await assert.rejects(fetchWorkspaceAiAccess('workspace-1'), /неизвестно/);
    status = 503;
    await assert.rejects(fetchWorkspaceAiAccess('workspace-1'), /не означает, что баланс исчерпан/);
    assert.ok(requests.every((url) => url === '/api/workspaces/workspace-1/providers'));
  } finally { globalThis.fetch = originalFetch; }
});
