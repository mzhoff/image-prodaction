'use client';

import { useCallback, useState } from 'react';
import type { DocumentUsage } from '@/modules/usage/contracts/document-usage';
import { useKeyBudget } from '@/features/provider-budget/model/use-key-budget';
import { useUsageResource } from '@/features/provider-budget/model/use-usage-resource';
export { readProviderKeyBudget as readCanvasKeyBudget } from '@/features/provider-budget/model/use-key-budget';
export type { ProviderKeyBudget as CanvasKeyBudget } from '@/features/provider-budget/model/use-key-budget';

async function readDocumentUsage(response: Response): Promise<DocumentUsage> {
  if (!response.ok) throw new Error('Не удалось обновить расходы.');
  return response.json();
}

export function useCanvasBudget(workspaceId: string | undefined, documentId: string | undefined, expanded: boolean) {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const balance = useKeyBudget(workspaceId, revision);
  const usage = useUsageResource(
    workspaceId && documentId ? `/api/projects/${encodeURIComponent(documentId)}/usage` : null,
    workspaceId, expanded, revision, readDocumentUsage, 15_000,
  );
  return { balance, usage, refresh };
}
