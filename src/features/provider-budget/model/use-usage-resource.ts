'use client';
import { useEffect, useState } from 'react';
import { PROVIDER_USAGE_UPDATED_EVENT, type ProviderUsageUpdatedDetail } from '@/shared/api/provider-usage-events';

export function useUsageResource<T>(url: string | null, workspaceId: string | undefined, enabled: boolean,
  revision: number, decode: (response: Response) => Promise<T>, intervalMs: number) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: boolean }>({ data: null, loading: false, error: false });
  useEffect(() => {
    if (!enabled || !url) return;
    const controller = new AbortController();
    let pending = false;
    let refreshQueued = false;
    async function load() {
      if (pending) { refreshQueued = true; return; }
      pending = true;
      setState((current) => ({ ...current, loading: true }));
      try {
        const response = await fetch(url!, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        const data = await decode(response);
        if (!controller.signal.aborted) setState({ data, loading: false, error: false });
      } catch {
        if (!controller.signal.aborted) setState((current) => ({ ...current,
          loading: false, error: true,
        }));
      } finally {
        pending = false;
        if (refreshQueued && !controller.signal.aborted) { refreshQueued = false; void load(); }
      }
    }
    const onUsage = (event: Event) => {
      if ((event as CustomEvent<ProviderUsageUpdatedDetail>).detail?.workspaceId === workspaceId) void load();
    };
    const whenVisible = () => { if (document.visibilityState === 'visible') void load(); };
    void load();
    const interval = window.setInterval(whenVisible, intervalMs);
    window.addEventListener('focus', whenVisible);
    document.addEventListener('visibilitychange', whenVisible);
    window.addEventListener(PROVIDER_USAGE_UPDATED_EVENT, onUsage);
    return () => {
      controller.abort(); window.clearInterval(interval);
      window.removeEventListener('focus', whenVisible);
      document.removeEventListener('visibilitychange', whenVisible);
      window.removeEventListener(PROVIDER_USAGE_UPDATED_EVENT, onUsage);
    };
  }, [decode, enabled, intervalMs, revision, url, workspaceId]);
  return state;
}
