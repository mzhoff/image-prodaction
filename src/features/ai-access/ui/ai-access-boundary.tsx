'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { loadWorkspaceAiAccess, readWorkspaceAiAccess, reportWorkspaceAiAccessError, subscribeWorkspaceAiAccess } from '@/modules/chat-assistant/adapters/client/workspace-ai-access-store';
import { checkAiAccessBeforeSubmit } from '../model/ai-access-gate';
import { AiAccessDialog } from './ai-access-dialog';

interface AiAccessGate { ensure: () => Promise<boolean>; onError: (error: unknown) => boolean }
const Context = createContext<AiAccessGate | null>(null);
export function useAiAccessGate() {
  const gate = useContext(Context);
  if (!gate) throw new Error('AI submission requires AiAccessBoundary.');
  return gate;
}

export function AiAccessBoundary({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const tUi = useTranslations();
  const subscribe = useCallback((notify: () => void) => subscribeWorkspaceAiAccess(workspaceId, notify), [workspaceId]);
  const snapshot = useCallback(() => readWorkspaceAiAccess(workspaceId), [workspaceId]);
  const access = useSyncExternalStore(subscribe, snapshot, () => undefined);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const refresh = () => { void loadWorkspaceAiAccess(workspaceId).catch(() => undefined); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [workspaceId]);
  const ensure = useCallback(async () => {
    const allowed = await checkAiAccessBeforeSubmit(workspaceId, (result) => {
      if (!active.current) return;
      setNotice(result ? '' : tUi("Не удалось проверить доступ. Проверьте соединение и попробуйте снова."));
      setOpen(true);
    });
    return active.current && allowed;
  }, [tUi, workspaceId]);
  const onError = useCallback((error: unknown) => {
    if (!reportWorkspaceAiAccessError(workspaceId, error)) return false;
    if (active.current) { setNotice(''); setOpen(true); }
    return true;
  }, [workspaceId]);
  const gate = useMemo(() => ({ ensure, onError }), [ensure, onError]);
  const refresh = async () => {
    setChecking(true); setNotice('');
    try {
      const result = await loadWorkspaceAiAccess(workspaceId, { force: true });
      if (!active.current) return;
      if (result.status === 'connected') setOpen(false);
      else setNotice(tUi("Доступ пока не изменился."));
    } catch { if (active.current) setNotice(tUi("Не удалось проверить доступ. Попробуйте чуть позже.")); }
    finally { if (active.current) setChecking(false); }
  };
  return <Context.Provider value={gate}>{children}{open ? <AiAccessDialog workspaceId={workspaceId} status={access?.status} checking={checking} notice={typeof (notice) === 'string' ? tUi((notice) as string) : (notice)} onCheck={refresh} onClose={() => setOpen(false)} /> : null}</Context.Provider>;
}
