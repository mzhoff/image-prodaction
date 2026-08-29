import { createHash } from 'node:crypto';
import { createPostgresPipelineRunStore } from '../adapters/postgres/postgres-pipeline-run-store';
import type {
  CompiledPipelinePlan,
  PipelineInputs,
  PipelineRunCompletion,
  PipelineRunJob,
  PipelineRunStore,
} from '../contracts/pipeline-contracts';
import type { PipelineRuntimeRun } from '../contracts/pipeline-runtime-contracts';
import { createPipelineRun } from '../core/pipeline-run-service';
import { validatePipelineInputValues } from '../core/pipeline-executor';
import { createUuidV7 } from '@/shared/lib/id';

export interface PipelineRuntimeExecutionTarget {
  compiledPlan: CompiledPipelinePlan;
  endpointPublicId: string;
  executionPolicy: { maxAttempts?: unknown };
  pipelineId: string;
  pipelineVersion: number;
  workspaceId: string;
}

export async function submitPipelineRuntimeRun(input: {
  apiKeyId?: string | null;
  consumerId?: string | null;
  idempotencyKey: string;
  pipelineInput: PipelineInputs;
  sourceApplication: string;
  target: PipelineRuntimeExecutionTarget;
}, store: PipelineRunStore = createPostgresPipelineRunStore()) {
  validatePipelineInputValues(
    input.target.compiledPlan.definition.inputs,
    input.pipelineInput,
  );

  return createPipelineRun({
    apiKeyId: input.apiKeyId,
    consumerId: input.consumerId,
    id: createUuidV7(),
    workspaceId: input.target.workspaceId,
    pipelineId: input.target.pipelineId,
    pipelineVersion: input.target.pipelineVersion,
    sourceApplication: input.sourceApplication,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: fingerprintPipelineRunRequest({
      input: input.pipelineInput,
      pipelineId: input.target.pipelineId,
      pipelineVersion: input.target.pipelineVersion,
    }),
    input: input.pipelineInput,
    maxAttempts: readPipelineMaxAttempts(input.target.executionPolicy),
  }, store);
}

export function toPipelineRuntimeRun(input: {
  endpointPublicId: string;
  idempotentReplay: boolean;
  result: PipelineRunCompletion | null;
  run: PipelineRunJob;
}): PipelineRuntimeRun {
  return {
    id: input.run.id,
    pipeline: {
      publicId: input.endpointPublicId,
      version: input.run.pipelineVersion,
    },
    status: input.run.status,
    outputs: input.result?.outputs ?? null,
    attemptCount: input.run.attemptCount,
    maxAttempts: input.run.maxAttempts,
    idempotentReplay: input.idempotentReplay,
    error: input.run.errorCode && input.run.errorMessage ? {
      code: input.run.errorCode,
      message: input.run.errorMessage,
      retryable: input.run.retryable ?? false,
    } : null,
    createdAt: input.run.createdAt.toISOString(),
    startedAt: input.run.startedAt?.toISOString() ?? null,
    finishedAt: input.run.finishedAt?.toISOString() ?? null,
    statusUrl: `/v1/runs/${input.run.id}`,
  };
}

export function fingerprintPipelineRunRequest(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function readPipelineMaxAttempts(policy: { maxAttempts?: unknown }) {
  const value = policy.maxAttempts;
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 10
    ? Number(value)
    : 3;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(record[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}
