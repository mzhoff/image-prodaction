import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadPipelinePlaygroundMedia } from './pipeline-playground-api';

for (const [kind, extension, mime] of [['image', 'png', 'image/png'], ['audio', 'mp3', 'audio/mpeg'], ['video', 'mp4', 'video/mp4']] as const) {
  test(`${kind} upload uses the matching ingestion endpoint and waits for the ready asset`, async (t) => {
    const jobId = '01a0c125-b11c-7420-83fc-f8fc6b67a4ec';
    const asset = { id: 'asset-ready', status: 'ready', byteSize: 4, checksumSha256: 'checksum', contentType: mime, height: null, width: null, originalName: `media.${extension}` };
    const calls: string[] = [];
    const controller = new AbortController();
    t.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
      calls.push(url);
      assert.equal(options?.signal, controller.signal);
      if (calls.length === 1) {
        assert.equal(url, `/api/assets/${kind === 'image' ? 'images' : kind}`);
        assert.equal(options?.method, 'POST');
        const body = options?.body as FormData;
        assert.equal(body.get('workspaceId'), 'workspace-1');
        assert.equal(body.get('origin'), 'uploaded');
        assert.equal((body.get('file') as File).name, `media.${extension}`);
        return Response.json({ job: { id: jobId } }, { status: 202 });
      }
      assert.equal(url, `/api/generation-jobs/${jobId}`);
      return Response.json({ job: { status: 'succeeded' }, asset });
    });
    const result = await uploadPipelinePlaygroundMedia(new File(['data'], `media.${extension}`, { type: mime }), 'workspace-1', kind, controller.signal);
    assert.equal(calls.length, 2);
    assert.deepEqual(result, { kind, assetId: asset.id, checksumSha256: asset.checksumSha256, mimeType: mime, sizeBytes: 4, width: null, height: null, originalName: asset.originalName });
  });
}

test('failed media processing produces an actionable error rather than an artifact', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'Формат не поддерживается' } }, { status: 422 }));
  await assert.rejects(uploadPipelinePlaygroundMedia(new File(['data'], 'scene.mov'), 'workspace-1', 'video'), /Формат не поддерживается/);
});
