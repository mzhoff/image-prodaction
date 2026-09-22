import { getProjectUsage } from '@/app/api-routes/projects/usage';

export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return getProjectUsage(request, (await context.params).projectId);
}
