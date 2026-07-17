export type WorkspaceSettingsRole = 'owner' | 'admin' | 'member';
export type ProviderConnectionStatus = 'connected' | 'invalid' | 'disconnected';

export interface WorkspaceSettingsOption {
  id: string;
  name: string;
  role: WorkspaceSettingsRole;
}

export interface ProviderConnectionDto {
  provider: 'openrouter';
  status: ProviderConnectionStatus;
  canManage: boolean;
  maskedKey: string | null;
  lastValidatedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
}

export interface OpenRouterKeyUsage {
  isFreeTier?: boolean | null;
  label?: string | null;
  limit: number | null;
  limitRemaining: number | null;
  limitReset?: string | null;
  usage: number | null;
  usageDaily: number | null;
  usageWeekly: number | null;
  usageMonthly: number | null;
  usageTotal: number | null;
  updatedAt: string;
}

export interface WorkspaceAiUsage {
  summary: {
    jobs: number;
    inputTokens: string;
    outputTokens: string;
    totalTokens: string;
    providerCostUsd: string;
  };
  byModel: Array<{
    modelId: string;
    jobs: number;
    totalTokens: string;
    providerCostUsd: string;
  }>;
  byOperation: Array<{
    operation: string;
    jobs: number;
    totalTokens: string;
    providerCostUsd: string;
  }>;
}

export interface WorkspaceProvidersResponse {
  workspace: WorkspaceSettingsOption;
  providers: ProviderConnectionDto[];
}

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

export class WorkspaceAiApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, payload?: ApiErrorPayload | null) {
    super(toReaderMessage(status, payload));
    this.name = 'WorkspaceAiApiError';
    this.status = status;
    this.code = payload?.error?.code ?? 'workspace_ai_request_failed';
  }
}

export async function fetchWorkspaceSettingsOptions(signal?: AbortSignal) {
  const payload = await requestJson<{
    workspaces: Array<{
      id: string;
      name: string;
      role: WorkspaceSettingsRole;
    }>;
  }>('/api/workspaces', { signal });
  return payload.workspaces;
}

export function fetchWorkspaceProviders(workspaceId: string, signal?: AbortSignal) {
  return requestJson<WorkspaceProvidersResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/providers`,
    { signal },
  );
}

export async function connectOpenRouter(workspaceId: string, apiKey: string) {
  return requestJson<{ provider: ProviderConnectionDto }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/providers/openrouter`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    },
  );
}

export async function validateOpenRouter(workspaceId: string) {
  return requestJson<{
    valid: boolean;
    provider: ProviderConnectionDto;
    keyUsage: OpenRouterKeyUsage | null;
  }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/providers/openrouter/validate`,
    { method: 'POST' },
  );
}

export async function disconnectOpenRouter(workspaceId: string) {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/providers/openrouter`,
    {
      method: 'DELETE',
      cache: 'no-store',
    },
  );
  if (!response.ok) throw await createResponseError(response);
}

export async function fetchOpenRouterUsage(workspaceId: string, signal?: AbortSignal) {
  const payload = await requestJson<{
    provider: 'openrouter';
    keyUsage: OpenRouterKeyUsage;
  }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/providers/openrouter/usage`,
    { signal },
  );
  return payload.keyUsage;
}

export async function fetchWorkspaceAiUsage(
  workspaceId: string,
  periodDays = 30,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ periodDays: String(periodDays) });
  return requestJson<WorkspaceAiUsage>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/ai-usage?${params.toString()}`,
    { signal },
  );
}

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...init,
  });
  if (!response.ok) throw await createResponseError(response);
  return response.json() as Promise<T>;
}

async function createResponseError(response: Response) {
  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
  return new WorkspaceAiApiError(response.status, payload);
}

function toReaderMessage(status: number, payload?: ApiErrorPayload | null) {
  if (status === 401) return 'Сессия завершилась. Войдите в аккаунт ещё раз.';
  if (status === 403) return 'У вас нет прав на управление AI-провайдерами этого Workspace.';
  if (status === 404) return 'Подключение AI-провайдера пока не настроено.';
  if (status === 409) return 'Состояние подключения изменилось. Обновите данные и повторите действие.';
  if (status === 422) return payload?.error?.message || 'Проверьте API key и повторите попытку.';
  if (status === 429) return 'Слишком много запросов. Подождите немного и повторите попытку.';
  if (status >= 500) return 'Сервис провайдера временно недоступен. Попробуйте ещё раз позже.';
  return payload?.error?.message || 'Не удалось выполнить запрос.';
}
