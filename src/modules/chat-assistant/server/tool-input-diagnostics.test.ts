import assert from 'node:assert/strict';
import test from 'node:test';
import { collectSafeToolInputDiagnostics } from './tool-input-diagnostics.ts';

test('tool diagnostics expose only safe issue codes and JSON paths', () => {
  const diagnostics = collectSafeToolInputDiagnostics({
    toolCalls: [{
      input: {
        documentName: 'Poster',
        edges: [],
        nodes: [{ key: 'qr', type: 'qrCode', secretValue: 'must-not-be-logged' }],
        summary: 'Build a QR poster.',
      },
      name: 'pipeline_build',
    }],
  });

  assert.deepEqual(diagnostics, [{
    issues: [{ code: 'additional-property', path: '/nodes/0' }],
    toolName: 'pipeline_build',
  }]);
  assert.doesNotMatch(JSON.stringify(diagnostics), /must-not-be-logged/);
});

test('tool diagnostics stay silent for normalized pipeline_update aliases', () => {
  assert.deepEqual(collectSafeToolInputDiagnostics({
    toolCalls: [{
      input: {
        summary: 'Connect the QR result.',
        edges: [{
          sourceNodeKey: 'qr', sourcePortId: 'image',
          targetNodeKey: 'composition', targetPortId: 'layer-1',
        }],
      },
      name: 'pipeline_update',
    }],
  }), []);
});
