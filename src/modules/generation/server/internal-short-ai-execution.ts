import {
  createGenerationJob,
  failGenerationJob,
  startGenerationJob,
  succeedGenerationJob,
} from '@/entities/generation/server/generation-orchestrator';
import type {
  ProviderExecuteRequest,
  ProviderResult,
} from '@/modules/provider-connections';
import {
  markOpenRouterProviderUsed,
  resolveOpenRouterCredentialForWorkspace,
} from '@/modules/provider-connections/server/provider-connection-service';
import { createRuntimeOpenRouterAdapter } from '@/modules/provider-connections/server/runtime-provider-adapter';
import { recordUsageEvent } from '@/modules/usage';
import {
  executeShortOpenRouterChatCore,
  type ShortAiExecutionDependencies,
} from './short-ai-execution-core';
import {
  markShortAiProviderDispatched,
  readShortAiResultCheckpoint,
  saveShortAiResultCheckpoint,
} from './short-ai-result-store';

export function executeInternalOpenRouterChat<T>(input: {
  actorUserId: string;
  documentId?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown> | null;
  providerRequest: ProviderExecuteRequest;
  signal: AbortSignal;
  transform(result: ProviderResult): T | Promise<T>;
  workspaceId: string;
}) {
  const request = new Request('http://pipeline-runtime.internal/execute', {
    headers: { 'x-request-id': input.idempotencyKey },
    signal: input.signal,
  });

  return executeShortOpenRouterChatCore({
    request,
    scope: {
      documentId: input.documentId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      workspaceId: input.workspaceId,
    },
    providerRequest: input.providerRequest,
    transform: input.transform,
  }, createInternalDependencies(input.actorUserId));
}

function createInternalDependencies(actorUserId: string): ShortAiExecutionDependencies {
  return {
    adapter: createRuntimeOpenRouterAdapter(),
    createJob: createGenerationJob,
    failJob: failGenerationJob,
    markProviderDispatched: markShortAiProviderDispatched,
    markProviderUsed: markOpenRouterProviderUsed,
    readResult: readShortAiResultCheckpoint,
    recordUsage: recordUsageEvent,
    resolveCredential: async (_userId, workspaceId) => (
      resolveOpenRouterCredentialForWorkspace(workspaceId)
    ),
    saveResult: saveShortAiResultCheckpoint,
    startJob: startGenerationJob,
    succeedJob: succeedGenerationJob,
    userId: async () => actorUserId,
  };
}
