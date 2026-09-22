'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectContents } from '@/modules/project-containers/contracts/project-contents';
import { loadProjectContents } from '../api/project-contents-api';

const EMPTY: ProjectContents = { stories: [], timelines: [], media: [], mediaTotal: 0, nextCursor: null };

export function useProjectContents(workspaceId: string, folderId: string, search: string) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [contents, setContents] = useState<ProjectContents>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const activeController = useRef<AbortController | null>(null);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    activeController.current = controller;
    setLoading(true); setLoadingMore(false); setError(''); setContents(EMPTY);
    const timer = setTimeout(() => {
      void loadProjectContents(workspaceId, folderId, search, controller.signal)
        .then((result) => { if (!controller.signal.aborted) setContents(result); })
        .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : tEffect("Не удалось загрузить проект.")); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 180 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [workspaceId, folderId, search, version]);
  const loadMore = async () => {
    const controller = activeController.current;
    if (!contents.nextCursor || loadingMore || !controller || controller.signal.aborted) return;
    setLoadingMore(true); setError('');
    try {
      const next = await loadProjectContents(workspaceId, folderId, search, controller.signal, contents.nextCursor);
      if (!controller.signal.aborted) setContents((current) => ({ ...next,
        media: [...current.media, ...next.media.filter((item) => !current.media.some((existing) => existing.id === item.id))],
      }));
    } catch { if (!controller.signal.aborted) setError(tUi("Не удалось загрузить следующую страницу. Повторите попытку.")); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  };
  return { contents, loading, loadingMore, error, refresh, loadMore };
}
