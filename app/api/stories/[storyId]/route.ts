import { storiesRequest } from '@/app/api-routes/stories/routes';
export const runtime = 'nodejs';
type Context = { params: Promise<{ storyId: string }> };
export const GET = async (request: Request, context: Context) => storiesRequest(request, (await context.params).storyId);
export const PUT = async (request: Request, context: Context) => storiesRequest(request, (await context.params).storyId);
