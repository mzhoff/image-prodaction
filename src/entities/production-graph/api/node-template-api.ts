import type { NodeTemplatePreset } from '@/entities/production-graph/model/node-template-preset';
import type { ProductionNode } from '@/entities/production-graph/model/types';

interface ApiErrorPayload {
  error?: { message?: string };
}

export async function fetchNodeTemplates(workspaceId: string, signal?: AbortSignal) {
  return requestJson<{ templates: NodeTemplatePreset[] }>(
    `/api/node-templates?workspaceId=${encodeURIComponent(workspaceId)}`,
    { cache: 'no-store', signal },
  ).then((result) => result.templates);
}

export async function createNodeTemplate(
  workspaceId: string,
  node: Pick<ProductionNode, 'data' | 'type'>,
) {
  return requestJson<{
    template: NodeTemplatePreset;
    strippedAssetReferenceCount: number;
  }>('/api/node-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, node }),
  });
}

export async function deleteNodeTemplate(workspaceId: string, templateId: string) {
  const response = await fetch(
    `/api/node-templates/${encodeURIComponent(templateId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: 'DELETE' },
  );
  if (!response.ok) throw await createResponseError(response);
}

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) throw await createResponseError(response);
  return response.json() as Promise<T>;
}

async function createResponseError(response: Response) {
  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
  return new Error(payload?.error?.message || `Request failed with status ${response.status}.`);
}
