import assert from 'node:assert/strict';
import test from 'node:test';
import { JsonRequestError, readBoundedJsonObject } from './read-bounded-json';

const request = (body: string, headers?: HeadersInit) => new Request('http://localhost/test', { method: 'POST', body, headers });
const rejects = (error: unknown, code: string, status: number) => {
  assert.ok(error instanceof JsonRequestError);
  assert.equal(error.code, code);
  assert.equal(error.status, status);
  return true;
};

test('reads valid JSON exactly at the byte limit, including a request above the old 10 MiB proxy cap', async () => {
  for (const body of ['{"text":"Бро"}', JSON.stringify({ padding: 'x'.repeat(15 * 1024 * 1024), tail: 'complete' })]) {
    assert.deepEqual(await readBoundedJsonObject(request(body), Buffer.byteLength(body)), JSON.parse(body));
  }
});

test('enforces actual bytes without trusting absent or false length headers', async () => {
  for (const headers of [undefined, { 'content-length': '1' }, { 'content-length': '101' }]) {
    await assert.rejects(readBoundedJsonObject(request(JSON.stringify({ a: 'x'.repeat(100) }), headers), 100), error => rejects(error, 'generation_request_too_large', 413));
  }
});

test('rejects null, arrays, primitives, empty and truncated JSON with a readable error', async () => {
  for (const body of ['null', '[]', '42', '"hello"', '', '{"tail":']) {
    await assert.rejects(readBoundedJsonObject(request(body), 100), error => rejects(error, 'invalid_json', 400));
  }
});

test('handles split UTF-8 chunks and cancels an oversized stream', async () => {
  const bytes = new TextEncoder().encode('{"text":"Бро"}');
  const streamRequest = (body: ReadableStream<Uint8Array>) => new Request('http://localhost/test', { method: 'POST', body, duplex: 'half' } as RequestInit);
  const good = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  assert.deepEqual(await readBoundedJsonObject(streamRequest(good), bytes.length), { text: 'Бро' });
  let canceled = false;
  const oversized = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(101)); }, cancel() { canceled = true; } });
  await assert.rejects(readBoundedJsonObject(streamRequest(oversized), 100), error => rejects(error, 'generation_request_too_large', 413));
  assert.equal(canceled, true);
});
