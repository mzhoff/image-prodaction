'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useCallback, useEffect, useState } from 'react';
import { loadWorkspaceAiAccess } from '@/modules/chat-assistant/adapters/client/workspace-ai-access-store';

export interface BillingWorkspace { id: string; name: string; role: 'owner' | 'admin' | 'member' }
export function useBillingWorkspaces(initialId?: string) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [workspaces, setWorkspaces] = useState<BillingWorkspace[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/workspaces', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data.workspaces)) throw new Error();
      const rows: BillingWorkspace[] = data.workspaces.filter((w: BillingWorkspace) => w && typeof w.id === 'string' && typeof w.name === 'string' && ['owner', 'admin', 'member'].includes(w.role));
      if (controller.signal.aborted) return;
      setWorkspaces(rows);
    }).catch(() => { if (!controller.signal.aborted) setError(tEffect("Не удалось загрузить пространства. Повторите попытку.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const selectedId = initialId ? workspaces.find((workspace) => workspace.id === initialId)?.id ?? '' : workspaces[0]?.id ?? '';
  const retry = () => { setError(''); setLoading(true); setRevision((value) => value + 1); };
  return { workspaces, selectedId, workspace: workspaces.find((w) => w.id === selectedId), error, loading, retry };
}

export function useBillingAccess(workspaceId?: string) {
  const tUi = useTranslations();
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  const check = useCallback(async () => {
    if (!workspaceId || checking) return;
    setChecking(true); setNotice('');
    try {
      const result = await loadWorkspaceAiAccess(workspaceId, { force: true });
      setNotice(result.status === 'connected' ? tUi("AI подключён. Можно вернуться к работе.") : result.status === 'not-activated'
        ? tUi("AI ещё не подключён. Подтверждение пополнения ожидается.") : result.status === 'budget-exhausted'
          ? tUi("Пополнение пока не подтверждено.") : tUi("Попросите владельца пространства проверить доступ."));
    } catch { setNotice(tUi("Не удалось проверить доступ. Попробуйте ещё раз.")); }
    finally { setChecking(false); }
  }, [tUi, workspaceId, checking]);
  return { notice, checking, check };
}
