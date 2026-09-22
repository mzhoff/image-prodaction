'use client';
import type { KeyBudget } from '@/modules/provider-connections/contracts/key-budget';
import { useUsageResource } from './use-usage-resource';

export type ProviderKeyBudget = { status: 'connected'; budget: KeyBudget } | { status: 'disconnected' };

export async function readProviderKeyBudget(response: Response): Promise<ProviderKeyBudget> {
  const body = await response.json();
  if (response.status === 409 && body.error?.code === 'provider_not_configured') return { status: 'disconnected' };
  if (!response.ok) throw new Error('Баланс временно недоступен.');
  return { status: 'connected', budget: body as KeyBudget };
}

export function useKeyBudget(workspaceId: string | undefined, revision = 0) {
  return useUsageResource(workspaceId ? `/api/ai/balance?workspaceId=${encodeURIComponent(workspaceId)}` : null, workspaceId, true, revision, readProviderKeyBudget, 60_000);
}
