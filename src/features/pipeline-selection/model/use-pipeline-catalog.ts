'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useCallback, useEffect, useRef, useState } from 'react';
import { fetchExecutablePipelineCatalog } from '@/modules/executable-pipelines/adapters/client/pipeline-catalog-api';
import type { ExecutablePipelineCatalogItem } from '@/modules/executable-pipelines/contracts/pipeline-catalog-contracts';

/** Keep a loaded picker in memory when closed; an explicit refresh revalidates the catalog. */
export function usePipelineCatalog(workspaceId?: string, enabled = true) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const cache = useRef<{ workspaceId: string; pipelines: ExecutablePipelineCatalogItem[] } | null>(null);
  const [state, setState] = useState<{ workspaceId?: string; pipelines: ExecutablePipelineCatalogItem[]; loading: boolean; error: string | null }>({ pipelines: [], loading: false, error: null });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { cache.current = null; setRevision((value) => value + 1); }, []);
  useEffect(() => {
    if (!workspaceId || !enabled) return;
    if (cache.current?.workspaceId === workspaceId) {
      setState({ workspaceId, pipelines: cache.current.pipelines, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({ workspaceId, pipelines: previous.workspaceId === workspaceId ? previous.pipelines : [], loading: true, error: null }));
    void fetchExecutablePipelineCatalog(workspaceId, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      cache.current = { workspaceId, pipelines: data.pipelines };
      setState({ workspaceId, pipelines: data.pipelines, loading: false, error: null });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ workspaceId, pipelines: [], loading: false,
        error: error instanceof Error ? error.message : tEffect("Не удалось загрузить pipeline.") });
    });
    return () => controller.abort();
  }, [enabled, revision, workspaceId]);
  return { pipelines: state.workspaceId === workspaceId ? state.pipelines : [],
    loading: Boolean(workspaceId && enabled && (state.workspaceId !== workspaceId || state.loading)),
    error: state.workspaceId === workspaceId ? state.error : null, refresh };
}
