import { storyCharactersRequest } from '@/app/api-routes/stories/characters';
export async function GET(request: Request, context: { params: Promise<{ storyId: string }> }) {
  return storyCharactersRequest(request, (await context.params).storyId, true);
}
export async function POST(request: Request, context: { params: Promise<{ storyId: string }> }) {
  return storyCharactersRequest(request, (await context.params).storyId, true);
}
