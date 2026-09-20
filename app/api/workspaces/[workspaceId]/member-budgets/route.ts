import { handleMemberBudgets } from '@/app/api-routes/workspaces/member-budgets';
export const runtime = 'nodejs';
interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}
export async function GET(request: Request, context: RouteContext) {
  return handleMemberBudgets(request, (await context.params).workspaceId);
}
export async function PATCH(request: Request, context: RouteContext) {
  return handleMemberBudgets(request, (await context.params).workspaceId);
}
