import { getOpenRouterProviderUsage } from '@/modules/provider-connections/server/provider-connection-service';
import { keyBudget } from '@/modules/provider-connections/core/key-budget';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { isUuid } from '@/shared/lib/id';
import { toShortAiApiErrorResponse } from './short-ai-execution';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get('workspaceId');
    if (!isUuid(workspaceId)) {
      return apiError('invalid_workspace_id', 'Invalid workspace id.', 400);
    }
    const session = await requireApiSession(request);
    const response = await getOpenRouterProviderUsage(session.user.id, workspaceId);
    const data = response.keyUsage;

    return Response.json({
      ...keyBudget(data),
      used: data.usage,
      usedToday: data.usageDaily,
      usedMonth: data.usageMonthly,
      provider: 'openrouter',
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toShortAiApiErrorResponse(error);
  }
}
