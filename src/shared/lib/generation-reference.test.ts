import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareGenerationReferenceForServer } from './image-data-url';

test('Generate Image sends a reference above the former 4.5 MB cap without browser re-encoding', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  class Reader {
    result = ''; onload?: () => void;
    async readAsDataURL(blob: Blob) {
      this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
      this.onload?.();
    }
  }
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: Reader });
  try {
    const bytes = Buffer.alloc(5_000_000, 7);
    assert.equal(await prepareGenerationReferenceForServer(new Blob([bytes], { type: 'image/png' })), `data:image/png;base64,${bytes.toString('base64')}`);
    await assert.rejects(prepareGenerationReferenceForServer(new Blob([Buffer.alloc(24_000_000)], { type: 'image/png' })), /30 МиБ/);
    await assert.rejects(prepareGenerationReferenceForServer(new Blob(['document'], { type: 'application/pdf' })), /PNG, JPEG, WebP или GIF/);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'FileReader', saved);
    else Reflect.deleteProperty(globalThis, 'FileReader');
  }
});
