import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  AssetNotFoundError,
  AssetNotReadyError,
  getAssetContent,
} from '@/entities/asset/server/asset-service';
import { apiError } from '@/shared/api/api-error';
import { createUuidV7, isUuidV7 } from '@/shared/lib/id';
import { createPostgresPipelineRunStore } from '../adapters/postgres/postgres-pipeline-run-store';
import type {
  PipelineInputs,
  PipelineRunCompletion,
  PipelineRunJob,
  PipelineValue,
} from '../contracts/pipeline-contracts';
import { PipelineDomainError } from '../contracts/pipeline-errors';
import type { PipelineRuntimeRun } from '../contracts/pipeline-runtime-contracts';
import {
  createPipelineRun,
  requestPipelineRunCancel,
} from '../core/pipeline-run-service';
import { validatePipelineInputValues } from '../core/pipeline-executor';
import {
  authenticatePipelineApiRequest,
  PipelineApiKeyAuthenticationError,
} from './pipeline-api-key-service';

const createRunBodySchema = z.object({
  input: z.record(z.string(), z.unknown()),
}).strict();

export async function postPipelineRuntimeRun(request: Request, publicId: string) {
  try {
    const identity = await authenticatePipelineApiRequest(request, publicId);
    const idempotencyKey = readIdempotencyKey(request);
    const parsed = createRunBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isPipelineInputs(parsed.data.input)) {
      return apiError('invalid_request', 'Request body must contain an input object.', 400);
    }
    const pipelineInput = parsed.data.input;

    validatePipelineInputValues(
      identity.compiledPlan.definition.inputs,
      pipelineInput,
    );

    const run = await createPipelineRun({
      id: createUuidV7(),
      workspaceId: identity.workspaceId,
      pipelineId: identity.pipelineId,
      pipelineVersion: identity.pipelineVersion,
      sourceApplication: identity.sourceApplication,
      idempotencyKey,
      requestFingerprint: fingerprintRequest({
        input: pipelineInput,
        pipelineId: identity.pipelineId,
        pipelineVersion: identity.pipelineVersion,
      }),
      input: pipelineInput,
      maxAttempts: readMaxAttempts(identity.executionPolicy),
    }, createPostgresPipelineRunStore());

    const response = Response.json(toRuntimeRun({
      endpointPublicId: identity.endpointPublicId,
      idempotentReplay: run.idempotentReplay,
      result: null,
      run,
    }), { status: 202 });
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Location', `/v1/runs/${run.id}`);
    return response;
  } catch (error) {
    return toPipelineRuntimeError(error);
  }
}

export async function getPipelineRuntimeRun(request: Request, runId: string) {
  try {
    if (!isUuidV7(runId)) return apiError('pipeline_run_not_found', 'Pipeline run was not found.', 404);
    const identity = await authenticatePipelineApiRequest(request);
    const store = createPostgresPipelineRunStore();
    const run = await store.findById(runId);
    if (!run || run.pipelineId !== identity.pipelineId) {
      return apiError('pipeline_run_not_found', 'Pipeline run was not found.', 404);
    }
    const result = run.status === 'succeeded' ? await store.getResult(run.id) : null;
    return Response.json(toRuntimeRun({
      endpointPublicId: identity.endpointPublicId,
      idempotentReplay: false,
      result,
      run,
    }), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return toPipelineRuntimeError(error);
  }
}

export async function cancelPipelineRuntimeRun(request: Request, runId: string) {
  try {
    if (!isUuidV7(runId)) return apiError('pipeline_run_not_found', 'Pipeline run was not found.', 404);
    const identity = await authenticatePipelineApiRequest(request);
    const store = createPostgresPipelineRunStore();
    const current = await store.findById(runId);
    if (!current || current.pipelineId !== identity.pipelineId) {
      return apiError('pipeline_run_not_found', 'Pipeline run was not found.', 404);
    }
    const run = await requestPipelineRunCancel(runId, new Date(), store);
    const result = run.status === 'succeeded' ? await store.getResult(run.id) : null;
    return Response.json(toRuntimeRun({
      endpointPublicId: identity.endpointPublicId,
      idempotentReplay: false,
      result,
      run,
    }), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return toPipelineRuntimeError(error);
  }
}

export async function getPipelineRuntimeArtifact(
  request: Request,
  runId: string,
  assetId: string,
) {
  try {
    if (!isUuidV7(runId) || !isUuidV7(assetId)) {
      return apiError('pipeline_run_not_found', 'Pipeline artifact was not found.', 404);
    }
    const identity = await authenticatePipelineApiRequest(request);
    const store = createPostgresPipelineRunStore();
    const run = await store.findById(runId);
    if (!run || run.pipelineId !== identity.pipelineId || run.status !== 'succeeded') {
      return apiError('pipeline_run_not_found', 'Pipeline artifact was not found.', 404);
    }
    const result = await store.getResult(run.id);
    if (!result || !containsAssetReference(result.outputs, assetId)) {
      return apiError('pipeline_run_not_found', 'Pipeline artifact was not found.', 404);
    }
    const content = await getAssetContent(identity.publishedByUserId, assetId);
    if (content.asset.workspaceId !== run.workspaceId) {
      return apiError('pipeline_run_not_found', 'Pipeline artifact was not found.', 404);
    }
    return new Response(content.object.body, {
      headers: {
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Length': String(content.object.contentLength ?? content.byteSize),
        'Content-Type': content.contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return toPipelineRuntimeError(error);
  }
}

function toRuntimeRun(input: {
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

function readIdempotencyKey(request: Request) {
  const value = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!value || value.length > 255 || /[\u0000-\u001f]/.test(value)) {
    throw new PipelineDomainError({
      code: 'pipeline_definition_invalid',
      message: 'A valid Idempotency-Key header is required.',
    });
  }
  return value;
}

function readMaxAttempts(policy: Record<string, unknown>) {
  const value = policy.maxAttempts;
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 10
    ? Number(value)
    : 3;
}

function fingerprintRequest(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
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

function isPipelineInputs(value: Record<string, unknown>): value is PipelineInputs {
  return Object.values(value).every(isPipelineValue);
}

function isPipelineValue(value: unknown): value is PipelineValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPipelineValue);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).every(isPipelineValue);
}

function containsAssetReference(value: PipelineValue, assetId: string): boolean {
  if (Array.isArray(value)) return value.some((entry) => containsAssetReference(entry, assetId));
  if (!value || typeof value !== 'object') return false;
  if (value.assetId === assetId && (value.kind === 'image' || value.kind === 'audio')) return true;
  return Object.values(value).some((entry) => containsAssetReference(entry, assetId));
}

function toPipelineRuntimeError(error: unknown) {
  if (error instanceof PipelineApiKeyAuthenticationError) {
    const response = apiError('unauthorized', error.message, 401);
    response.headers.set('WWW-Authenticate', 'Bearer realm="pipeline-runtime"');
    return response;
  }
  if (error instanceof PipelineDomainError) {
    const status = error.code === 'pipeline_idempotency_conflict'
      ? 409
      : error.code === 'pipeline_run_not_found'
        ? 404
        : 422;
    return apiError(error.code, error.message, status);
  }
  if (error instanceof AssetNotFoundError) {
    return apiError('pipeline_run_not_found', 'Pipeline artifact was not found.', 404);
  }
  if (error instanceof AssetNotReadyError) {
    return apiError('pipeline_artifact_not_ready', 'Pipeline artifact is not ready.', 409);
  }
  console.error('Pipeline Runtime API request failed', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return apiError('pipeline_runtime_unavailable', 'Pipeline runtime is temporarily unavailable.', 503);
}
