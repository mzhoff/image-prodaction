import { and, eq } from 'drizzle-orm';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { getDb } from '@/shared/db/client';
import { createPostgresPipelineRunStore } from '../adapters/postgres/postgres-pipeline-run-store';
import {
  executablePipeline,
  pipelineEndpoint,
  pipelineVersion,
} from '../adapters/postgres/pipeline-schema';
import type {
  PipelinePlaygroundDescriptor,
  PipelinePlaygroundRun,
} from '../contracts/pipeline-playground-contracts';
import type {
  CompiledPipelinePlan,
  PipelineInputs,
  PipelineRunCompletion,
} from '../contracts/pipeline-contracts';
import type { StudioPipelineSourceMetadata } from '../contracts/pipeline-publication-contracts';
import { inferPipelineOutputKind } from './pipeline-catalog-mapping';
import {
  submitPipelineRuntimeRun,
  toPipelineRuntimeRun,
} from './pipeline-runtime-run-service';

const PLAYGROUND_SOURCE_APPLICATION = 'image-production-playground';

export class PipelinePlaygroundEndpointNotFoundError extends Error {
  constructor() {
    super('Executable pipeline was not found.');
    this.name = 'PipelinePlaygroundEndpointNotFoundError';
  }
}

export class PipelinePlaygroundRunNotFoundError extends Error {
  constructor() {
    super('Playground run was not found.');
    this.name = 'PipelinePlaygroundRunNotFoundError';
  }
}

export async function getPipelinePlaygroundDescriptor(input: {
  publicId: string;
  userId: string;
}) {
  const target = await resolvePlaygroundTarget(input.publicId);
  await requireWorkspaceMembership(input.userId, target.workspaceId);
  return mapPipelinePlaygroundDescriptor(target);
}

export async function createPipelinePlaygroundRun(input: {
  idempotencyKey: string;
  pipelineInput: PipelineInputs;
  publicId: string;
  userId: string;
}): Promise<PipelinePlaygroundRun> {
  const target = await resolvePlaygroundTarget(input.publicId);
  await requireWorkspaceMembership(input.userId, target.workspaceId);
  const run = await submitPipelineRuntimeRun({
    target,
    sourceApplication: PLAYGROUND_SOURCE_APPLICATION,
    idempotencyKey: input.idempotencyKey,
    pipelineInput: input.pipelineInput,
  });
  return {
    ...toPipelineRuntimeRun({
      endpointPublicId: target.endpointPublicId,
      idempotentReplay: run.idempotentReplay,
      result: null,
      run,
    }),
    usage: null,
  };
}

export async function getPipelinePlaygroundRun(input: {
  runId: string;
  userId: string;
}): Promise<PipelinePlaygroundRun> {
  const store = createPostgresPipelineRunStore();
  const run = await store.findById(input.runId);
  if (!run || run.sourceApplication !== PLAYGROUND_SOURCE_APPLICATION) {
    throw new PipelinePlaygroundRunNotFoundError();
  }
  await requireWorkspaceMembership(input.userId, run.workspaceId);
  const [endpoint] = await getDb().select({
    publicId: pipelineEndpoint.publicId,
  }).from(pipelineEndpoint)
    .where(eq(pipelineEndpoint.pipelineId, run.pipelineId))
    .limit(1);
  if (!endpoint) throw new PipelinePlaygroundRunNotFoundError();
  const result = run.status === 'succeeded' ? await store.getResult(run.id) : null;
  return toPlaygroundRun(endpoint.publicId, run, result);
}

export function mapPipelinePlaygroundDescriptor(target: PlaygroundTarget): PipelinePlaygroundDescriptor {
  const inputMetadata = new Map(
    target.sourceMetadata?.inputs.map((boundary) => [boundary.name, boundary]) ?? [],
  );
  const outputMetadata = new Map(
    target.sourceMetadata?.outputs.map((boundary) => [boundary.name, boundary]) ?? [],
  );
  return {
    publicId: target.endpointPublicId,
    endpointPath: `/v1/pipelines/${encodeURIComponent(target.endpointPublicId)}/runs`,
    workspaceId: target.workspaceId,
    name: target.name,
    version: target.pipelineVersion,
    inputs: Object.entries(target.compiledPlan.definition.inputs).map(([name, contract]) => {
      const boundary = inputMetadata.get(name);
      return {
        name,
        label: boundary?.nodeTitle || humanizeFieldName(name),
        description: contract.description ?? null,
        kind: contract.kind,
        required: contract.required,
      };
    }),
    outputs: Object.entries(target.compiledPlan.definition.outputs).map(([name, binding]) => {
      const boundary = outputMetadata.get(name);
      return {
        name,
        label: boundary?.nodeTitle || humanizeFieldName(name),
        kind: boundary?.kind ?? inferPipelineOutputKind(
          target.compiledPlan,
          binding.nodeId,
          binding.outputKey,
        ),
      };
    }),
  };
}

interface PlaygroundTarget {
  compiledPlan: CompiledPipelinePlan;
  endpointPublicId: string;
  executionPolicy: Record<string, unknown>;
  name: string;
  pipelineId: string;
  pipelineVersion: number;
  sourceMetadata: StudioPipelineSourceMetadata | null;
  workspaceId: string;
}

async function resolvePlaygroundTarget(publicId: string): Promise<PlaygroundTarget> {
  const [target] = await getDb().select({
    compiledPlan: pipelineVersion.compiledPlan,
    endpointPublicId: pipelineEndpoint.publicId,
    executionPolicy: pipelineEndpoint.executionPolicy,
    name: executablePipeline.name,
    pipelineId: executablePipeline.id,
    pipelineVersion: pipelineVersion.version,
    sourceMetadata: pipelineVersion.sourceMetadata,
    workspaceId: executablePipeline.workspaceId,
  }).from(pipelineEndpoint)
    .innerJoin(executablePipeline, eq(executablePipeline.id, pipelineEndpoint.pipelineId))
    .innerJoin(pipelineVersion, eq(pipelineVersion.id, pipelineEndpoint.activeVersionId))
    .where(and(
      eq(pipelineEndpoint.publicId, publicId),
      eq(pipelineEndpoint.enabled, true),
      eq(executablePipeline.status, 'active'),
    ))
    .limit(1);
  if (!target) throw new PipelinePlaygroundEndpointNotFoundError();
  return target;
}

function toPlaygroundRun(
  endpointPublicId: string,
  run: Parameters<typeof toPipelineRuntimeRun>[0]['run'],
  result: PipelineRunCompletion | null,
): PipelinePlaygroundRun {
  return {
    ...toPipelineRuntimeRun({
      endpointPublicId,
      idempotentReplay: false,
      result,
      run,
    }),
    usage: result?.usage ?? null,
  };
}

function humanizeFieldName(value: string) {
  const normalized = value.replaceAll(/[_-]+/g, ' ').trim();
  return normalized ? `${normalized[0]?.toUpperCase() ?? ''}${normalized.slice(1)}` : 'Input';
}
