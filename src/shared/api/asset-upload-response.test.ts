import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { awaitAssetUpload } from './asset-upload-response';

test('accepted uploads wait for a ready asset; terminal failure is surfaced rather than returning pending metadata', async () => {
  const id = randomUUID(), asset = { id: randomUUID(), status: 'ready' }; let calls = 0;
  const ready = await awaitAssetUpload(Response.json({ job: { id }, statusUrl: 'https://untrusted.invalid' }, { status: 202 }), async (url) => {
    assert.equal(url, `/api/generation-jobs/${id}`); calls++; return Response.json({ job: { status: 'succeeded' }, asset });
  });
  assert.deepEqual(await ready.json(), { asset }); assert.equal(calls, 1);
  const failure = await awaitAssetUpload(Response.json({ job: { id } }, { status: 202 }), async () => Response.json({ job: { status: 'failed', error: { retryable: false, message: 'Неверный формат' } } }));
  assert.equal(failure.status, 422); assert.equal((await failure.json()).error.message, 'Неверный формат');
});
test('synchronous consumers stay compatible; caller cancellation stops polling without canceling accepted processing', async () => {
  const original = Response.json({ asset: { id: 'a' } }); assert.equal(await awaitAssetUpload(original, async () => { throw new Error('No poll'); }), original);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(awaitAssetUpload(Response.json({ job: { id: randomUUID() } }, { status: 202 }), async () => { throw new Error('No poll after abort'); }, controller.signal), { name: 'AbortError' });
});
