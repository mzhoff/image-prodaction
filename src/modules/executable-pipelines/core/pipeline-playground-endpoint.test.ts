import assert from 'node:assert/strict';
import test from 'node:test';
import { PipelineDomainError } from '../contracts/pipeline-errors';
import {
  isPipelinePublicId,
  parsePipelinePlaygroundEndpoint,
} from './pipeline-playground-endpoint';

const publicId = 'pln_019fb9e98e757364b4c34ca908554584';

test('playground endpoint accepts same-origin absolute and relative runtime URLs', () => {
  assert.equal(
    parsePipelinePlaygroundEndpoint(
      `http://localhost:3004/v1/pipelines/${publicId}/runs`,
      'http://localhost:3004',
    ),
    publicId,
  );
  assert.equal(
    parsePipelinePlaygroundEndpoint(`/v1/pipelines/${publicId}/runs`, 'http://localhost:3004'),
    publicId,
  );
  assert.equal(isPipelinePublicId(publicId), true);
});

test('playground endpoint rejects remote origins and malformed runtime paths', () => {
  assert.throws(
    () => parsePipelinePlaygroundEndpoint(
      `https://example.com/v1/pipelines/${publicId}/runs`,
      'http://localhost:3004',
    ),
    PipelineDomainError,
  );
  assert.throws(
    () => parsePipelinePlaygroundEndpoint(`/v1/pipelines/${publicId}`, 'http://localhost:3004'),
    PipelineDomainError,
  );
  assert.equal(isPipelinePublicId('pln_test'), false);
});
