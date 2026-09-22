import { projectContentsRequest } from '@/app/api-routes/project-containers/contents';

export async function GET(request: Request, context: { params: Promise<{ folderId: string }> }) {
  return projectContentsRequest(request, (await context.params).folderId);
}
