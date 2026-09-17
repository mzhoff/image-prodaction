import { isUuidV7 } from '@/shared/lib/id';
import type { ProductionNode, ProductionNodeData, TextToSpeechNodeData } from './types';

/** Reopening the same persisted node may resume status polling; imported/copied nodes may not. */
export function normalizeSpeechRequest(value: unknown): TextToSpeechNodeData['speechRequest'] {
  if (!isRecord(value) || !isRecord(value.metadata)) return undefined;
  if (!boundedString(value.idempotencyKey, 200) || !/^[\x21-\x7e]+$/.test(value.idempotencyKey)
    || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)
    || (value.jobId !== undefined && !isUuidV7(value.jobId))) return undefined;
  const { language, model, voice } = value.metadata;
  if (language !== 'auto' && language !== 'ru' && language !== 'en' && language !== 'de' && language !== 'es' && language !== 'zh') return undefined;
  if (!boundedString(model, 240) || !boundedString(voice, 160)) return undefined;
  return { idempotencyKey: value.idempotencyKey, fingerprint: value.fingerprint,
    ...(value.jobId ? { jobId: value.jobId } : {}), metadata: { language, model, voice },
  };
}

/** A duplicate keeps results/settings, but must never attach itself to another node's active job. */
export function clearCopiedNodeExecution(node: ProductionNode): ProductionNode {
  const data = { ...node.data } as unknown as Record<string, unknown>;
  for (const key of ['videoRequest', 'speechRequest', 'generationRequest', 'editGenerationRequest', 'editGenerationRequests',
    'referenceGenerationRequests', 'referenceGenerationBatchPending']) delete data[key];
  if (node.type === 'timelineHandoff') delete data.request;
  return { ...node, status: 'idle', data: data as unknown as ProductionNodeData };
}

function boundedString(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
