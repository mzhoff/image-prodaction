'use client';

import { useEffect, useState } from 'react';
import { fetchExecutablePipelineCatalog } from '@/modules/executable-pipelines/adapters/client/pipeline-catalog-api';
import type { ExecutablePipelineCatalogItem } from '@/modules/executable-pipelines/contracts/pipeline-catalog-contracts';

export function useWorkspacePipelines(workspaceId?: string) {
  const [pipelines, setPipelines] = useState<ExecutablePipelineCatalogItem[]>([]);
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setPipelines([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    void fetchExecutablePipelineCatalog(workspaceId, controller.signal)
      .then((catalog) => {
        setPipelines(catalog.pipelines);
        setError(null);
      })
      .catch((caughtError) => {
        if (controller.signal.aborted) return;
        setError(caughtError instanceof Error ? caughtError.message : 'Pipelines could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [workspaceId]);

  return { error, loading, pipelines };
}
