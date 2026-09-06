import { runtimeV2RunRequestSchema, type RuntimeV2RunRequest } from '@/modules/executable-pipelines/contracts/runtime-v2-run-contracts';
import type { RuntimeV2Grant } from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import { validatePipelineInputValues } from '@/modules/executable-pipelines/core/pipeline-io-validation';

export interface RuntimeTestAttempt { key: string; request: RuntimeV2RunRequest }

export function createRuntimeTestAttempt(grant: RuntimeV2Grant, text: string, cap: string, key: string): RuntimeTestAttempt {
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new Error('Введите корректный JSON во входных данных.'); }
  const parsed = runtimeV2RunRequestSchema.safeParse({
    input, expectedGrantRevision: grant.revision,
    ...(cap.trim() ? { maximumProviderCostUsd: cap.trim() } : {}),
  });
  if (!parsed.success) throw new Error('Проверьте JSON-объект и лимит стоимости. Для суммы используйте точку.');
  validatePipelineInputValues(grant.input.fields, parsed.data.input, grant.input.semanticContract ?? undefined);
  return { key, request: parsed.data };
}

export function initialRuntimeTestInput(grant: RuntimeV2Grant) {
  return JSON.stringify(Object.fromEntries(Object.entries(grant.input.fields).filter(([, field]) => field.required)
    .map(([name, field]) => [name, field.defaultValue ?? (field.kind === 'text' ? '' : field.kind === 'number' ? 0
      : field.kind === 'boolean' ? false : field.kind.endsWith('_collection') ? [] : {})])), null, 2);
}

export function runtimeRunIsTerminal(status: string) {
  return ['succeeded', 'failed', 'canceled'].includes(status);
}

export function runtimeArtifactPath(workspace: string, client: string, run: string, asset: unknown) {
  if (typeof asset !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(asset)) return null;
  return `/api/workspaces/${encodeURIComponent(workspace)}/runtime-connections/clients/${encodeURIComponent(client)}/runs/${encodeURIComponent(run)}/artifacts/${encodeURIComponent(asset)}`;
}
