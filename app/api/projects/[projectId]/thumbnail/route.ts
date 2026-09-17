import { postProjectThumbnail } from '@/app/api-routes/projects/thumbnail';
import { createGetProjectThumbnailHandler } from '@/app/api-routes/projects/thumbnail-get-handler';
import { getDocument } from '@/entities/document/server/document-service';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { toApiErrorResponse } from '@/app/api-routes/error-response';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

const getProjectThumbnail = createGetProjectThumbnailHandler({
  userId: async (request) => (await requireApiSession(request)).user.id,
  getDocument,
  toErrorResponse: toApiErrorResponse,
});

export async function GET(request: Request, context: RouteContext) {
  return getProjectThumbnail(request, (await context.params).projectId);
}

export async function POST(request: Request, context: RouteContext) {
  return postProjectThumbnail(request, (await context.params).projectId);
}
