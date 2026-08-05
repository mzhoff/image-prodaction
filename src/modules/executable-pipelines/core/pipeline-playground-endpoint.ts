import { PipelineDomainError } from '../contracts/pipeline-errors';

const PIPELINE_RUN_PATH = /^\/v1\/pipelines\/(pln_[0-9a-f]{32})\/runs\/?$/i;

export function parsePipelinePlaygroundEndpoint(value: string, currentOrigin: string) {
  const normalized = value.trim();
  if (!normalized) throw invalidEndpoint();

  let endpoint: URL;
  try {
    endpoint = new URL(normalized, currentOrigin);
  } catch {
    throw invalidEndpoint();
  }

  if (endpoint.origin !== currentOrigin || endpoint.search || endpoint.hash) {
    throw invalidEndpoint();
  }
  const match = PIPELINE_RUN_PATH.exec(endpoint.pathname);
  if (!match?.[1]) throw invalidEndpoint();
  return match[1];
}

export function isPipelinePublicId(value: unknown): value is string {
  return typeof value === 'string' && /^pln_[0-9a-f]{32}$/i.test(value);
}

function invalidEndpoint() {
  return new PipelineDomainError({
    code: 'pipeline_definition_invalid',
    message: 'Use a pipeline endpoint from this Image Production environment.',
  });
}
