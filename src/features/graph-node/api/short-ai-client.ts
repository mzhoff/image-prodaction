import { getActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { notifyProviderUsageUpdated } from '@/shared/api/provider-usage-events';

export function withActiveAiScope<T extends object>(payload: T) {
  const scope = getActiveAssetScope();
  if (!scope) throw new Error('Откройте документ в рабочем пространстве перед запуском AI-операции.');
  return { ...payload, ...scope, idempotencyKey: crypto.randomUUID() };
}

export async function fetchShortAi(path: string, payload: object) {
  const body = JSON.stringify(payload);
  const execute = () => fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  try {
    const response = await execute();
    notifyUsageFromScopedPayload(response, payload);
    return response;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const response = await execute();
    notifyUsageFromScopedPayload(response, payload);
    return response;
  }
}

function notifyUsageFromScopedPayload(response: Response, payload: object) {
  if (!response.ok || !('workspaceId' in payload)) return;
  const workspaceId = payload.workspaceId;
  if (typeof workspaceId === 'string') notifyProviderUsageUpdated(workspaceId);
}
