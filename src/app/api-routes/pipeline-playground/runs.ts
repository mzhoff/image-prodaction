import { z } from 'zod';
import {
  createPipelinePlaygroundRun,
  getPipelinePlaygroundRun,
} from '@/modules/executable-pipelines/server/pipeline-playground-service';
import { isPipelinePublicId } from '@/modules/executable-pipelines/core/pipeline-playground-endpoint';
import type { PipelineInputs, PipelineValue } from '@/modules/executable-pipelines/contracts/pipeline-contracts';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { isUuidV7 } from '@/shared/lib/id';
import { toPipelinePlaygroundErrorResponse } from './error-response';

const createRunSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(255),
  input: z.record(z.string(), z.unknown()),
  publicId: z.string().refine(isPipelinePublicId),
}).strict();

export async function postPipelinePlaygroundRun(request: Request) {
  try {
    const parsed = createRunSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isPipelineInputs(parsed.data.input)) {
      return apiError('invalid_request', 'Valid pipeline inputs are required.', 400);
    }
    const session = await requireApiSession(request);
    const run = await createPipelinePlaygroundRun({
      idempotencyKey: parsed.data.idempotencyKey,
      pipelineInput: parsed.data.input,
      publicId: parsed.data.publicId,
      userId: session.user.id,
    });
    return Response.json({ run }, {
      status: 202,
      headers: {
        'Cache-Control': 'private, no-store',
        Location: `/api/pipeline-playground/runs/${run.id}`,
      },
    });
  } catch (error) {
    return toPipelinePlaygroundErrorResponse(error);
  }
}

export async function getPipelinePlaygroundRunResponse(request: Request, runId: string) {
  try {
    if (!isUuidV7(runId)) return apiError('pipeline_run_not_found', 'Playground run was not found.', 404);
    const session = await requireApiSession(request);
    const run = await getPipelinePlaygroundRun({ runId, userId: session.user.id });
    return Response.json({ run }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toPipelinePlaygroundErrorResponse(error);
  }
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
