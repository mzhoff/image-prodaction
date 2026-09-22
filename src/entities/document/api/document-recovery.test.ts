import assert from 'node:assert/strict';
import test from 'node:test';
import { captureDocumentRecoverySnapshot, recoverDocumentAfterLoadFailure, saveDocumentRecoverySnapshot } from './document-recovery';
import { createEmptyProjectUiState, createProjectExport } from '@/entities/production-graph/model/project-schema';
import { initialProject } from '@/entities/production-graph/model/initial-project';

test('a failed document load never exposes another document or invalid local recovery', (context) => {
  const data = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  context.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } } });
  const snapshot = createProjectExport(initialProject, createEmptyProjectUiState());
  saveDocumentRecoverySnapshot('previous-document', snapshot);
  captureDocumentRecoverySnapshot('previous-document', () => { throw new Error('Partial editor mutation'); });
  assert.deepEqual(JSON.parse(data.get('reverie-document-recovery:v1:previous-document')!), snapshot,
    'a partial mutation must leave the last usable emergency copy intact');
  let imported = 0;
  assert.equal(recoverDocumentAfterLoadFailure('new-document', () => { imported++; }).phase, 'error');
  assert.equal(imported, 0);
  assert.equal(recoverDocumentAfterLoadFailure('previous-document', (value) => {
    assert.deepEqual(value, snapshot); imported++;
  }).phase, 'recovery');
  assert.equal(imported, 1);
  assert.equal(recoverDocumentAfterLoadFailure('previous-document', () => { throw new Error('Invalid snapshot'); }).phase, 'error');
  assert.equal(data.size, 1, 'failed opening must preserve the recovery copy');
});
