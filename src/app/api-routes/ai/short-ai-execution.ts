import { z } from 'zod';
import {
  createGenerationJob,
  failGenerationJob,
  GenerationDocumentWorkspaceMismatchError,
  GenerationIdempotencyConflictError,
  GenerationJobTransitionError,
  GenerationJobValidationError,
  startGenerationJob,
  succeedGenerationJob,
} from '@/entities/generation/server/generation-orchestrator';
import {
  ProviderAdapterError,
  type ProviderErrorDescriptor,
} from '@/modules/provider-connections';
import {
  markOpenRouterProviderUsed,
  ProviderConnectionNotConfiguredError,
  resolveOpenRouterCredential,
} from '@/modules/provider-connections/server/provider-connection-service';
import { ProviderCredentialConfigurationError } from '@/modules/provider-connections/server/credential-crypto-config';
import { createRuntimeOpenRouterAdapter } from '@/modules/provider-connections/server/runtime-provider-adapter';
import { recordUsageEvent } from '@/modules/usage';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';
import {
  markShortAiProviderDispatched,
  readShortAiResultCheckpoint,
  saveShortAiResultCheckpoint,
} from './short-ai-result-store';
import {
  executeShortOpenRouterCallCore,
  executeShortOpenRouterChatCore,
  ShortAiExecutionError,
  type ShortAiExecutionDependencies,
} from './short-ai-execution-core';

export {
  createEmptyProviderCallResult,
  getProviderText,
  ShortAiExecutionError,
  type ShortAiExecutionDependencies,
  type ShortAiScope,
} from './short-ai-execution-core';

export const shortAiScopeSchema = z.object({
  documentId: z.string().refine(isUuidV7, 'documentId must be UUIDv7').optional(),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
  workspaceId: z.string().refine(isUuidV7, 'workspaceId must be UUIDv7'),
});

export function executeShortOpenRouterChat<T>(
  input: Parameters<typeof executeShortOpenRouterChatCore<T>>[0],
  dependencies: ShortAiExecutionDependencies = createDefaultDependencies(),
) {
  return executeShortOpenRouterChatCore(input, dependencies);
}

export function executeShortOpenRouterCall<TProvider, TResult>(
  input: Parameters<typeof executeShortOpenRouterCallCore<TProvider, TResult>>[0],
  dependencies: ShortAiExecutionDependencies = createDefaultDependencies(),
) {
  return executeShortOpenRouterCallCore(input, dependencies);
}

export function toShortAiApiErrorResponse(error: unknown) {
  if (error instanceof ProviderConnectionNotConfiguredError) {
    return apiError('provider_not_configured', error.message, 409);
  }
  if (error instanceof ProviderCredentialConfigurationError) {
    return apiError(
      'provider_credentials_not_configured',
      'Server credential encryption is not configured.',
      503,
    );
  }
  if (error instanceof ShortAiExecutionError || error instanceof ProviderAdapterError) {
    const descriptor = error.descriptor;
    return apiError(
      descriptor.code,
      descriptor.message,
      providerStatus(descriptor),
      {
        details: {
          classification: descriptor.classification,
          retryAfterSeconds: descriptor.retryAfterMs === null
            ? null
            : Math.ceil(descriptor.retryAfterMs / 1_000),
        },
      },
    );
  }
  if (
    error instanceof GenerationIdempotencyConflictError
    || error instanceof GenerationJobTransitionError
  ) {
    return apiError('generation_conflict', error.message, 409);
  }
  if (
    error instanceof GenerationJobValidationError
    || error instanceof GenerationDocumentWorkspaceMismatchError
  ) {
    return apiError('invalid_generation_request', error.message, 422);
  }
  return toApiErrorResponse(error);
}

function createDefaultDependencies(): ShortAiExecutionDependencies {
  return {
    adapter: createRuntimeOpenRouterAdapter(),
    createJob: createGenerationJob,
    failJob: failGenerationJob,
    markProviderDispatched: markShortAiProviderDispatched,
    markProviderUsed: markOpenRouterProviderUsed,
    readResult: readShortAiResultCheckpoint,
    recordUsage: recordUsageEvent,
    resolveCredential: resolveOpenRouterCredential,
    startJob: startGenerationJob,
    saveResult: saveShortAiResultCheckpoint,
    succeedJob: succeedGenerationJob,
    userId: async (request) => (await requireApiSession(request)).user.id,
  };
}

function providerStatus(descriptor: ProviderErrorDescriptor) {
  if (descriptor.httpStatus === 409) return 409;
  switch (descriptor.code) {
    case 'invalid_credential':
      return 409;
    case 'payment_required':
      return 402;
    case 'rate_limited':
      return 429;
    case 'timeout':
      return 504;
    case 'upstream_unavailable':
    case 'network_error':
      return 503;
    case 'missing_modality':
    case 'invalid_response':
      return 502;
    case 'canceled':
      return 499;
    default:
      return descriptor.httpStatus && descriptor.httpStatus >= 400 && descriptor.httpStatus < 500
        ? descriptor.httpStatus
        : 422;
  }
}
