import { getStoryConversation } from '@/app/api-routes/stories/conversation-route';
export async function GET(request: Request, context: { params: Promise<{ storyId: string }> }) {
  return getStoryConversation(request, (await context.params).storyId);
}
