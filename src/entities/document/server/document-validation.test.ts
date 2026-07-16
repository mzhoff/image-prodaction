import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentValidationError, validateDocumentSnapshot } from './document-validation';

const validSnapshot = {
  kind: 'projectSnapshot',
  schemaVersion: 1,
  exportedAt: '2026-07-16T00:00:00.000Z',
  project: { nodes: [], edges: [] },
  uiState: {},
  assetsManifest: [],
};

test('accepts the current project snapshot envelope', () => {
  assert.equal(validateDocumentSnapshot(validSnapshot).kind, 'projectSnapshot');
});

test('rejects an unsupported snapshot version and oversized graph collections', () => {
  assert.throws(
    () => validateDocumentSnapshot({ ...validSnapshot, schemaVersion: 999 }),
    (error: unknown) => error instanceof DocumentValidationError && error.code === 'invalid_snapshot',
  );
  assert.throws(
    () => validateDocumentSnapshot({
      ...validSnapshot,
      project: { nodes: Array.from({ length: 2_001 }, () => ({})), edges: [] },
    }),
    (error: unknown) => error instanceof DocumentValidationError && error.code === 'snapshot_limits_exceeded',
  );
});
