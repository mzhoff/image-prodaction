import type { PipelinePlaygroundField } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import type { PipelineArtifactReference } from '@/modules/executable-pipelines/contracts/pipeline-contracts';
import type { PipelinePlaygroundDraft } from './pipeline-playground-inputs';

export const TERMINAL_PIPELINE_STATUSES = new Set(['canceled', 'failed', 'succeeded']);

export function createInitialDrafts(fields: PipelinePlaygroundField[]) {
  return Object.fromEntries(fields.map((field) => [
    field.name,
    field.kind === 'boolean' && field.required ? false : undefined,
  ])) as Record<string, PipelinePlaygroundDraft>;
}

export function isArtifactReference(value: unknown): value is PipelineArtifactReference {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { kind?: unknown }).kind === 'image'
    && typeof (value as { assetId?: unknown }).assetId === 'string';
}

export function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
