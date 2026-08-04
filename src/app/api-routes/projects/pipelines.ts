import { z } from 'zod';
import { PipelineDomainError } from '@/modules/executable-pipelines/contracts/pipeline-errors';
import {
  listStudioPipelinePublications,
  publishStudioPipeline,
} from '@/modules/executable-pipelines/server/pipeline-publication-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

const documentIdSchema = z.string().refine(isUuidV7);
const publishBodySchema = z.object({
  sectionId: z.string().trim().min(1).max(200),
  snapshot: z.unknown(),
});

export async function getProjectPipelines(request: Request, documentId: string) {
  try {
    if (!documentIdSchema.safeParse(documentId).success) return apiError('invalid_project_id', 'Invalid project id.', 400);
    const session = await requireApiSession(request);
    return Response.json({
      pipelines: await listStudioPipelinePublications({ documentId, userId: session.user.id }),
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function postProjectPipeline(request: Request, documentId: string) {
  try {
    if (!documentIdSchema.safeParse(documentId).success) return apiError('invalid_project_id', 'Invalid project id.', 400);
    const session = await requireApiSession(request);
    const parsed = publishBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError('invalid_request', 'Pipeline publication request is invalid.', 400);
    const pipeline = await publishStudioPipeline({
      documentId,
      sectionId: parsed.data.sectionId,
      snapshot: parsed.data.snapshot,
      userId: session.user.id,
    });
    return Response.json({ pipeline }, { status: 201 });
  } catch (error) {
    if (error instanceof PipelineDomainError) return apiError(error.code, error.message, 422);
    return toApiErrorResponse(error);
  }
}
