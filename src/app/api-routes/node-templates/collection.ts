import { z } from 'zod';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import {
  listNodeTemplates,
  saveNodeTemplate,
} from '@/entities/production-graph/server/node-template-service';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { apiError } from '@/shared/api/api-error';
import { isUuid } from '@/shared/lib/id';
import { toNodeTemplateApiErrorResponse } from './error-response';

const MAX_REQUEST_BYTES = 128 * 1024;
const workspaceIdSchema = z.string().refine(isUuid);
const createTemplateBody = z.object({
  workspaceId: workspaceIdSchema,
  node: z.object({
    type: z.string().refine((value) => PRODUCTION_NODE_TYPES.includes(value as ProductionNodeType)),
    data: z.record(z.string(), z.unknown()),
  }),
}).strict();

export async function getNodeTemplates(request: Request) {
  try {
    const session = await requireApiSession(request);
    const workspaceId = new URL(request.url).searchParams.get('workspaceId');
    if (!workspaceIdSchema.safeParse(workspaceId).success) {
      return apiError('invalid_workspace_id', 'A valid workspaceId is required.', 400);
    }
    return Response.json({
      templates: await listNodeTemplates({ userId: session.user.id, workspaceId: workspaceId! }),
    });
  } catch (error) {
    return toNodeTemplateApiErrorResponse(error);
  }
}

export async function postNodeTemplate(request: Request) {
  try {
    const session = await requireApiSession(request);
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return apiError('node_template_too_large', 'The node template preset is too large.', 413);
    }
    const parsed = createTemplateBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError('invalid_request', 'A valid workspace and node template are required.', 400);
    }
    const result = await saveNodeTemplate({
      data: parsed.data.node.data,
      nodeType: parsed.data.node.type as ProductionNodeType,
      userId: session.user.id,
      workspaceId: parsed.data.workspaceId,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return toNodeTemplateApiErrorResponse(error);
  }
}
