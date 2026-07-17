'use client';

import { useEffect, useState } from 'react';
import {
  PROVIDER_USAGE_UPDATED_EVENT,
  type ProviderUsageUpdatedDetail,
} from '@/shared/api/provider-usage-events';

const REFRESH_INTERVAL_MS = 60_000;

interface OpenRouterBalanceProps {
  workspaceId?: string;
}

interface OpenRouterBalanceData {
  remaining: number | null;
  updatedAt: string;
  used: number | null;
}

export function OpenRouterBalance({ workspaceId }: OpenRouterBalanceProps) {
  const [balance, setBalance] = useState<OpenRouterBalanceData | null>(null);

  useEffect(() => {
    setBalance(null);
    if (!workspaceId) return undefined;

    const activeWorkspaceId = workspaceId;
    const controller = new AbortController();
    let pending = false;
    async function loadBalance() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(
          `/api/ai/balance?workspaceId=${encodeURIComponent(activeWorkspaceId)}`,
          {
            cache: 'no-store',
            credentials: 'same-origin',
            signal: controller.signal,
          },
        );
        if (response.status === 404 || response.status === 409) {
          setBalance(null);
          return;
        }
        if (!response.ok) return;
        const result = await response.json() as OpenRouterBalanceData;
        setBalance(result);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          // Keep the last successful budget snapshot during a temporary network failure.
        }
      } finally {
        pending = false;
      }
    }

    const refreshAfterUsage = (event: Event) => {
      const detail = (event as CustomEvent<ProviderUsageUpdatedDetail>).detail;
      if (detail?.workspaceId === activeWorkspaceId) void loadBalance();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadBalance();
    };

    void loadBalance();
    const interval = window.setInterval(loadBalance, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', loadBalance);
    window.addEventListener(PROVIDER_USAGE_UPDATED_EVENT, refreshAfterUsage);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', loadBalance);
      window.removeEventListener(PROVIDER_USAGE_UPDATED_EVENT, refreshAfterUsage);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [workspaceId]);

  if (!balance) return null;

  return (
    <div
      className="openrouter-balance"
      aria-label={`OpenRouter: осталось ${formatMoney(balance.remaining)}, потрачено ${formatMoney(balance.used)}`}
      role="status"
      title={`Данные OpenRouter обновлены ${formatUpdateTime(balance.updatedAt)}`}
    >
      <div className="openrouter-balance-provider">
        <span aria-hidden="true" />
        OpenRouter
      </div>
      <div className="openrouter-balance-metrics">
        <div>
          <span>Остаток</span>
          <strong>{formatMoney(balance.remaining)}</strong>
        </div>
        <div>
          <span>Потрачено</span>
          <strong>{formatMoney(balance.used)}</strong>
        </div>
      </div>
    </div>
  );
}

function formatMoney(value: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `$${value.toFixed(Math.abs(value) < 1 ? 4 : 2)}`;
}

function formatUpdateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'недавно';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
