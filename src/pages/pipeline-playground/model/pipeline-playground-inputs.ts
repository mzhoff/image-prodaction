import type { PipelinePlaygroundField } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import type {
  PipelineArtifactReference,
  PipelineInputs,
  PipelineValue,
} from '@/modules/executable-pipelines/contracts/pipeline-contracts';

export type PipelinePlaygroundDraft =
  | PipelineArtifactReference
  | PipelineArtifactReference[]
  | boolean
  | string
  | undefined;

export interface PipelinePlaygroundInputBuildResult {
  errors: Record<string, string>;
  input: PipelineInputs;
  ready: boolean;
}

export function buildPipelinePlaygroundInput(
  fields: PipelinePlaygroundField[],
  drafts: Record<string, PipelinePlaygroundDraft>,
  uploadingFields: ReadonlySet<string> = new Set(),
): PipelinePlaygroundInputBuildResult {
  const input: PipelineInputs = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (uploadingFields.has(field.name)) {
      errors[field.name] = 'Wait for the upload to finish.';
      continue;
    }
    const parsed = parseDraft(field, drafts[field.name]);
    if (parsed.error) errors[field.name] = parsed.error;
    if (parsed.value !== undefined) input[field.name] = parsed.value;
  }

  return {
    errors,
    input,
    ready: Object.keys(errors).length === 0,
  };
}

function parseDraft(
  field: PipelinePlaygroundField,
  draft: PipelinePlaygroundDraft,
): { error?: string; value?: PipelineValue } {
  if (field.kind === 'boolean') {
    if (typeof draft === 'boolean') return { value: draft };
    return field.required ? { error: 'Choose a value.' } : {};
  }

  if (field.kind === 'image' || field.kind === 'audio') {
    if (isArtifactReference(draft, field.kind)) return { value: draft };
    return field.required ? { error: `Upload ${field.kind === 'image' ? 'an image' : 'an audio file'}.` } : {};
  }

  if (field.kind === 'image_collection') {
    if (Array.isArray(draft) && draft.length > 0 && draft.every((item) => isArtifactReference(item, 'image'))) {
      return { value: draft };
    }
    return field.required ? { error: 'Upload at least one image.' } : {};
  }

  const raw = typeof draft === 'string' ? draft : '';
  if (!raw.trim()) return field.required ? { error: 'This field is required.' } : {};

  if (field.kind === 'text') return { value: raw };
  if (field.kind === 'text_collection') {
    const values = raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    return values.length > 0 ? { value: values } : { error: 'Add at least one line.' };
  }
  if (field.kind === 'number') {
    const value = Number(raw);
    return Number.isFinite(value) ? { value } : { error: 'Enter a valid number.' };
  }
  if (field.kind === 'json' || field.kind === 'publication') {
    try {
      const value = JSON.parse(raw) as unknown;
      return isPipelineValue(value) ? { value } : { error: 'Enter valid JSON data.' };
    } catch {
      return { error: 'Enter valid JSON data.' };
    }
  }
  return { error: `Input type “${field.kind}” is not supported in Playground yet.` };
}

function isArtifactReference(
  value: PipelinePlaygroundDraft | PipelineArtifactReference,
  kind: 'audio' | 'image',
): value is PipelineArtifactReference {
  return Boolean(value)
    && !Array.isArray(value)
    && typeof value === 'object'
    && value.kind === kind
    && typeof value.assetId === 'string'
    && Boolean(value.assetId.trim());
}

function isPipelineValue(value: unknown): value is PipelineValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPipelineValue);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).every(isPipelineValue);
}
