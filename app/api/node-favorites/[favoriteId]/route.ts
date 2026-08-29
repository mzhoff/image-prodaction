import { deleteFavoriteNodeItem } from '@/app/api-routes/node-favorites/item';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ favoriteId: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  return deleteFavoriteNodeItem(request, (await context.params).favoriteId);
}
