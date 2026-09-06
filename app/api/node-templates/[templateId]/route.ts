import { deleteNodeTemplateItem } from '@/app/api-routes/node-templates/item';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ templateId: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  return deleteNodeTemplateItem(request, (await context.params).templateId);
}
