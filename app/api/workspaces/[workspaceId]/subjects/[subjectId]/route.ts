import { subjectRequest } from '@/app/api-routes/workspaces/subjects';
async function handler(request: Request, context: { params: Promise<{ workspaceId: string; subjectId: string }> }) {
  const { workspaceId, subjectId } = await context.params; return subjectRequest(request, workspaceId, subjectId);
}
export { handler as GET, handler as PUT };
