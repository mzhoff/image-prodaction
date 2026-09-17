import { getWorkspaceUsageDashboard } from '@/app/api-routes/workspaces/usage-dashboard';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  return getWorkspaceUsageDashboard(request, (await context.params).workspaceId);
}
