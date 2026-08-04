'use client';

import type { ExecutablePipelineCatalog } from '../../contracts/pipeline-catalog-contracts';

export async function fetchExecutablePipelineCatalog(
  workspaceId: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/pipelines`,
    { cache: 'no-store', signal },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message || `Pipeline catalog failed with status ${response.status}.`);
  }
  return response.json() as Promise<ExecutablePipelineCatalog>;
}
