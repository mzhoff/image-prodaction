import assert from 'node:assert/strict';
import test from 'node:test';

import { checksumPipelineBoundarySchema } from './pipeline-publication-service';

const fields = {
  topic: { kind: 'text' as const, required: true },
};

test('manual boundary checksum preserves the historical field-only algorithm', () => {
  assert.equal(
    checksumPipelineBoundarySchema(fields),
    'ea20dadd05eebe4f29528da9e3b6e0dfc0cda1a8247dc88fec41a686a52f3300',
  );
});

test('semantic boundary checksum uses a distinct stable versioned envelope', () => {
  const semanticContract = {
    contractKey: 'example.request.v1',
    contractRef: 'urn:example:request:1',
    contractVersion: '1.0.0',
    schemaChecksum: 'a'.repeat(64),
    schema: {
      type: 'object' as const,
      additionalProperties: false as const,
      properties: { topic: { type: 'string' as const } },
      required: ['topic'],
    },
  };
  const first = checksumPipelineBoundarySchema(fields, semanticContract);

  assert.equal(first, checksumPipelineBoundarySchema(fields, structuredClone(semanticContract)));
  assert.notEqual(first, checksumPipelineBoundarySchema(fields));
});
