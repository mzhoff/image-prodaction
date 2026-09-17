import { subjectRequest } from '@/app/api-routes/workspaces/subjects';
export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  return subjectRequest(request, (await context.params).workspaceId);
}
