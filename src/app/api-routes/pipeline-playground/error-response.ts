import {
  PipelinePlaygroundEndpointNotFoundError,
  PipelinePlaygroundRunNotFoundError,
} from '@/modules/executable-pipelines/server/pipeline-playground-service';
import { PipelineDomainError } from '@/modules/executable-pipelines/contracts/pipeline-errors';
import { apiError } from '@/shared/api/api-error';
import { toApiErrorResponse } from '../error-response';

export function toPipelinePlaygroundErrorResponse(error: unknown) {
  if (error instanceof PipelinePlaygroundEndpointNotFoundError) {
    return apiError('pipeline_not_found', error.message, 404);
  }
  if (error instanceof PipelinePlaygroundRunNotFoundError) {
    return apiError('pipeline_run_not_found', error.message, 404);
  }
  if (error instanceof PipelineDomainError) {
    const status = error.code === 'pipeline_idempotency_conflict' ? 409 : 422;
    return apiError(error.code, error.message, status);
  }
  return toApiErrorResponse(error);
}
