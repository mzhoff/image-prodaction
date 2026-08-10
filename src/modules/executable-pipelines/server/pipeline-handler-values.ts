import type { TextSplitterMode } from '@/entities/production-graph/model/types';
import type { PipelineValue } from '../contracts/pipeline-contracts';

export function compareInputKeys(first: string, second: string) {
  const firstIndex = Number(first.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
  const secondIndex = Number(second.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
  return firstIndex - secondIndex || first.localeCompare(second);
}

export function readString(value: PipelineValue | undefined) {
  return typeof value === 'string' ? value : '';
}

export function requireString(value: PipelineValue | undefined, label: string) {
  const normalized = readString(value).trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export function readReasoning(value: PipelineValue | undefined) {
  return value === 'medium' || value === 'high' ? value : 'low';
}

export function readTemperature(value: PipelineValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(2, Math.max(0, value))
    : 1;
}

export function readTextSplitterMode(value: PipelineValue | undefined): TextSplitterMode {
  return value === 'newline' || value === 'paragraph'
    || value === 'numbered-list' || value === 'delimiter'
    ? value
    : 'delimiter';
}

export function isString(value: PipelineValue): value is string {
  return typeof value === 'string';
}
