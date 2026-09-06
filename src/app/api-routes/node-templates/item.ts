import { z } from 'zod';
import { deleteNodeTemplate } from '@/entities/production-graph/server/node-template-service';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { apiError } from '@/shared/api/api-error';
import { isUuidV7 } from '@/shared/lib/id';
import { toNodeTemplateApiErrorResponse } from './error-response';

const uuidV7Schema = z.string().refine(isUuidV7);

export async function deleteNodeTemplateItem(request: Request, templateId: string) {
  try {
    const session = await requireApiSession(request);
    const workspaceId = new URL(request.url).searchParams.get('workspaceId');
    if (!uuidV7Schema.safeParse(templateId).success
      || !uuidV7Schema.safeParse(workspaceId).success) {
      return apiError('invalid_node_template', 'Valid template and workspace ids are required.', 400);
    }
    await deleteNodeTemplate({
      templateId,
      userId: session.user.id,
      workspaceId: workspaceId!,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return toNodeTemplateApiErrorResponse(error);
  }
}
