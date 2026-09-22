import type { PipelinePlaygroundField } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import type { PipelineArtifactReference } from '@/modules/executable-pipelines/contracts/pipeline-contracts';
import type { PipelinePlaygroundDraft } from './pipeline-playground-inputs';

export const TERMINAL_PIPELINE_STATUSES = new Set(['canceled', 'failed', 'succeeded']);

export function createInitialDrafts(fields: PipelinePlaygroundField[]) {
  return Object.fromEntries(fields.map((field) => [
    field.name,
    initialDraft(field),
  ])) as Record<string, PipelinePlaygroundDraft>;
}

function initialDraft(field: PipelinePlaygroundField): PipelinePlaygroundDraft {
  const value = field.defaultValue;
  if (value === undefined) return field.kind === 'boolean' && field.required ? false : undefined;
  if (field.kind === 'json' || field.kind === 'publication') return JSON.stringify(value, null, 2);
  if (field.kind === 'text_collection' && Array.isArray(value)) return value.join('\n');
  if (isArtifactReference(value)) return value;
  if (Array.isArray(value) && value.every(isArtifactReference)) return value;
  if (typeof value === 'boolean') return value;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

export function isArtifactReference(value: unknown): value is PipelineArtifactReference {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && ['image', 'audio', 'video'].includes((value as { kind: string }).kind)
    && typeof (value as { assetId?: unknown }).assetId === 'string'
    && Boolean((value as { assetId: string }).assetId.trim());
}

export function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const done = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = window.setTimeout(done, milliseconds);
    const abort = () => {
      window.clearTimeout(timer); signal.removeEventListener('abort', abort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}
