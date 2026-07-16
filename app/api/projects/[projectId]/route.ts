import { deleteProject, getProject, patchProject } from '@/app/api-routes/projects/item';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getProject(request, (await context.params).projectId);
}

export async function PATCH(request: Request, context: RouteContext) {
  return patchProject(request, (await context.params).projectId);
}

export async function DELETE(request: Request, context: RouteContext) {
  return deleteProject(request, (await context.params).projectId);
}
