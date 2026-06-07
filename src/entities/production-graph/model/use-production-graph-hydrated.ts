'use client';

import { useProductionGraphStore } from './use-production-graph-store';

export function useProductionGraphHydrated() {
  return useProductionGraphStore((state) => state.pipelineSync.initialized);
}
