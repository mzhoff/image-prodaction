'use client';

import { useEffect, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { isUuidV7 } from '@/shared/lib/id';
import { useProductionGraphHydrated } from '@/entities/production-graph/model/use-production-graph-hydrated';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';

interface PipelineRouteGateProps {
  children: ReactNode;
}

export function PipelineRouteGate({ children }: PipelineRouteGateProps) {
  const router = useRouter();
  const params = useParams<{ pipelineId?: string }>();
  const hydrated = useProductionGraphHydrated();
  const activePipelineId = useProductionGraphStore((state) => state.activePipelineId);
  const pipelines = useProductionGraphStore((state) => state.pipelines);
  const switchPipeline = useProductionGraphStore((state) => state.switchPipeline);
  const routePipelineId = getRoutePipelineId(params?.pipelineId);
  const routePipeline = routePipelineId
    ? pipelines.find((pipeline) => pipeline.id === routePipelineId)
    : undefined;
  const validRoutePipelineId = isUuidV7(routePipelineId);
  const ready = validRoutePipelineId && Boolean(routePipeline);

  useEffect(() => {
    if (!validRoutePipelineId) {
      router.replace('/');
      return;
    }

    if (routePipeline) {
      if (routePipelineId !== activePipelineId) {
        switchPipeline(routePipelineId);
      }
      return;
    }

    if (hydrated) {
      router.replace('/');
    }
  }, [activePipelineId, hydrated, routePipeline, routePipelineId, router, switchPipeline, validRoutePipelineId]);

  if (!ready) {
    return (
      <main className="editor-page">
        <div className="pipeline-route-loading" />
      </main>
    );
  }

  return children;
}

function getRoutePipelineId(value: string | string[] | undefined) {
  const id = Array.isArray(value) ? value[0] : value;
  return id?.toLowerCase() ?? '';
}
