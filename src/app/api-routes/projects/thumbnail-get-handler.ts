import type { getDocument } from '@/entities/document/server/document-service';
import { createDocumentOverviewSvg, DOCUMENT_OVERVIEW_VERSION, hasDocumentOverview } from '@/entities/document/model/document-overview';
import { apiError } from '@/shared/api/api-error';
import { isUuid } from '@/shared/lib/id';

interface ThumbnailDependencies {
  userId(request: Request): Promise<string>;
  getDocument: typeof getDocument;
  toErrorResponse(error: unknown): Response;
}

export function createGetProjectThumbnailHandler(dependencies: ThumbnailDependencies) {
  return async (request: Request, projectId: string) => {
    try {
      if (!isUuid(projectId)) return apiError('invalid_project_id', 'Invalid project id.', 400);
      const userId = await dependencies.userId(request);
      // Authorize on every request, including cache revalidation, using the saved Workspace.
      const project = await dependencies.getDocument(userId, projectId);
      if (!project.snapshot || !hasDocumentOverview(project.snapshot)) return apiError('thumbnail_not_available', 'This document has no graph preview yet.', 404);
      const headers = {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'private, no-cache',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Cookie',
        ETag: `"graph-${DOCUMENT_OVERVIEW_VERSION}-${project.id}-${project.revision}"`,
      };
      if (request.headers.get('if-none-match') === headers.ETag) return new Response(null, { status: 304, headers });
      return new Response(createDocumentOverviewSvg(project.snapshot), { headers });
    } catch (error) { return dependencies.toErrorResponse(error); }
  };
}
