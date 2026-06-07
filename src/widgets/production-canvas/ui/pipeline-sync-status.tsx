'use client';

import { AlertCircle, CheckCircle2, Clock3, Cloud, Loader2 } from 'lucide-react';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import type { PipelineSyncStatus as PipelineSyncStatusValue } from '@/entities/production-graph/model/store-types';

const statusLabels: Record<PipelineSyncStatusValue, string> = {
  error: 'Sync error',
  idle: 'Ready',
  loading: 'Loading',
  pending: 'Unsaved',
  synced: 'Synced',
  syncing: 'Saving',
};

export function PipelineSyncStatus() {
  const sync = useProductionGraphStore((state) => state.pipelineSync);
  const Icon = getStatusIcon(sync.status);
  const title = sync.error ?? statusLabels[sync.status];

  return (
    <div className={`pipeline-sync-status pipeline-sync-status-${sync.status}`} title={title}>
      <Icon size={14} />
      <span>{statusLabels[sync.status]}</span>
    </div>
  );
}

function getStatusIcon(status: PipelineSyncStatusValue) {
  if (status === 'error') return AlertCircle;
  if (status === 'pending') return Clock3;
  if (status === 'synced') return CheckCircle2;
  if (status === 'syncing' || status === 'loading') return Loader2;
  return Cloud;
}
