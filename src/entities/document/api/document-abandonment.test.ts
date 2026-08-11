import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearPendingUntouchedDocument,
  listPendingUntouchedDocuments,
  markPendingUntouchedDocument,
} from './document-abandonment.ts';

test('pending untouched documents use a bounded, versioned storage record', () => {
  const storage = createMemoryStorage();
  const now = Date.now();
  markPendingUntouchedDocument('document-1', storage, now + 100);
  markPendingUntouchedDocument('document-2', storage, now + 200);
  markPendingUntouchedDocument('document-1', storage, now + 300);

  assert.deepEqual(listPendingUntouchedDocuments(storage, now + 300), ['document-1', 'document-2']);
  assert.match(storage.value ?? '', /"version":1/);

  clearPendingUntouchedDocument('document-1', storage);
  assert.deepEqual(listPendingUntouchedDocuments(storage, now + 300), ['document-2']);
});

test('expired or malformed pending records are ignored', () => {
  const storage = createMemoryStorage();
  markPendingUntouchedDocument('expired', storage, 0);
  assert.deepEqual(listPendingUntouchedDocuments(storage, 8 * 24 * 60 * 60 * 1_000), []);

  storage.value = '{broken';
  assert.deepEqual(listPendingUntouchedDocuments(storage), []);
});

function createMemoryStorage() {
  return {
    value: null as string | null,
    getItem() {
      return this.value;
    },
    removeItem() {
      this.value = null;
    },
    setItem(_key: string, value: string) {
      this.value = value;
    },
  };
}
