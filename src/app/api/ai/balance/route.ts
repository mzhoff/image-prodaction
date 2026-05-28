import { fetchOpenRouterKey, formatOpenRouterError, getOpenRouterErrorStatus } from '@/shared/api/openrouter';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const response = await fetchOpenRouterKey();
    const data = response.data ?? {};

    return Response.json({
      limit: data.limit ?? null,
      remaining: data.limit_remaining ?? null,
      used: data.usage ?? null,
      usedToday: data.usage_daily ?? null,
      usedMonth: data.usage_monthly ?? null,
      provider: 'openrouter',
    });
  } catch (error) {
    return Response.json({
      limit: null,
      remaining: null,
      used: null,
      usedToday: null,
      usedMonth: null,
      error: formatOpenRouterError(error, 'OpenRouter balance request failed'),
      status: getOpenRouterErrorStatus(error),
      provider: 'openrouter',
    });
  }
}
