'use client';
import { useEffect, useState } from 'react';
import type { UsageDashboardData } from '@/modules/usage/contracts/usage-dashboard';

export function useUsageDashboard(workspaceId: string, from: string, to: string, timezone: string, refresh: number) {
  const key = JSON.stringify([workspaceId, from, to, timezone, refresh]);
  const [state, setState] = useState<{ key: string; data?: UsageDashboardData; error?: string }>({ key: '' });
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ from, to, timezone });
    void (async () => {
      try {
        const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/usage?${query}`, {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(response.status === 403 ? 'Нет доступа к статистике этого Workspace.' : body.error?.message || 'Не удалось загрузить статистику.');
        if (body.workspaceId !== workspaceId || !Array.isArray(body.rows) || !Array.isArray(body.comparison?.rows)) throw new Error('Сервер вернул некорректную статистику.');
        if (!controller.signal.aborted) setState({ key, data: body });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Не удалось загрузить статистику.' });
      }
    })();
    return () => controller.abort();
  }, [key, workspaceId, from, to, timezone]);
  // Never flash a prior Workspace or time range while the new response is loading.
  return state.key === key ? state : { key };
}
