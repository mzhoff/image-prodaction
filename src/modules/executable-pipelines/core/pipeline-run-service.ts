import type {
  NewPipelineRun,
  PipelineInputs,
  PipelineRunJob,
  PipelineRunStore,
} from '../contracts/pipeline-contracts';
import { PipelineDomainError } from '../contracts/pipeline-errors';

export interface CreatePipelineRunInput {
  id: string;
  idempotencyKey: string;
  input: PipelineInputs;
  maxAttempts?: number;
  pipelineId: string;
  pipelineVersion: number;
  requestFingerprint: string;
  sourceApplication: string;
  workspaceId: string;
}

export async function createPipelineRun(
  input: CreatePipelineRunInput,
  store: PipelineRunStore,
): Promise<PipelineRunJob & { idempotentReplay: boolean }> {
  const normalized = normalizeNewRun(input);
  const result = await store.createOrFind(normalized);

  if (!result.created && !hasSameFingerprint(result.run, normalized)) {
    throw new PipelineDomainError({
      code: 'pipeline_idempotency_conflict',
      message: 'Idempotency key is already used for a different pipeline run.',
    });
  }

  return {
    ...result.run,
    idempotentReplay: !result.created,
  };
}

export async function requestPipelineRunCancel(
  runId: string,
  requestedAt: Date,
  store: PipelineRunStore,
) {
  const run = await store.requestCancel({
    requestedAt: normalizeDate(requestedAt, 'Cancellation time'),
    runId: normalizeIdentifier(runId, 'Run id'),
  });
  if (!run) {
    throw new PipelineDomainError({
      code: 'pipeline_run_not_found',
      message: 'Pipeline run was not found.',
    });
  }
  return run;
}

function normalizeNewRun(input: CreatePipelineRunInput): NewPipelineRun {
  return {
    id: normalizeIdentifier(input.id, 'Run id'),
    workspaceId: normalizeIdentifier(input.workspaceId, 'Workspace id'),
    pipelineId: normalizeIdentifier(input.pipelineId, 'Pipeline id'),
    pipelineVersion: normalizeVersion(input.pipelineVersion),
    sourceApplication: normalizeKey(input.sourceApplication, 'Source application', 120),
    idempotencyKey: normalizeKey(input.idempotencyKey, 'Idempotency key', 255),
    requestFingerprint: normalizeKey(
      input.requestFingerprint,
      'Request fingerprint',
      255,
    ),
    input: normalizeInputs(input.input),
    maxAttempts: normalizeMaxAttempts(input.maxAttempts),
  };
}

function hasSameFingerprint(run: PipelineRunJob, input: NewPipelineRun) {
  return run.workspaceId === input.workspaceId
    && run.pipelineId === input.pipelineId
    && run.pipelineVersion === input.pipelineVersion
    && run.sourceApplication === input.sourceApplication
    && run.requestFingerprint === input.requestFingerprint
    && run.maxAttempts === input.maxAttempts;
}

function normalizeInputs(input: PipelineInputs) {
  const serialized = JSON.stringify(input);
  if (serialized.length > 256_000) {
    throw new PipelineDomainError({
      code: 'pipeline_input_invalid',
      message: 'Pipeline input exceeds the first-version size limit.',
    });
  }
  return structuredClone(input);
}

function normalizeIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(normalized)) {
    throw new PipelineDomainError({
      code: 'pipeline_definition_invalid',
      message: `${label} has an invalid format.`,
    });
  }
  return normalized;
}

function normalizeKey(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f]/.test(normalized)) {
    throw new PipelineDomainError({
      code: 'pipeline_definition_invalid',
      message: `${label} has an invalid format.`,
    });
  }
  return normalized;
}

function normalizeVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new PipelineDomainError({
      code: 'pipeline_definition_invalid',
      message: 'Pipeline version must be a positive safe integer.',
    });
  }
  return value;
}

function normalizeMaxAttempts(value?: number) {
  if (value === undefined) return 3;
  if (!Number.isSafeInteger(value) || value < 1 || value > 10) {
    throw new PipelineDomainError({
      code: 'pipeline_definition_invalid',
      message: 'Max attempts must be between 1 and 10.',
    });
  }
  return value;
}

function normalizeDate(value: Date, label: string) {
  if (!Number.isFinite(value.getTime())) {
    throw new PipelineDomainError({
      code: 'pipeline_definition_invalid',
      message: `${label} is invalid.`,
    });
  }
  return value;
}
