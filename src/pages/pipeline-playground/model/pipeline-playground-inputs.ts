import type { PipelinePlaygroundField } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import { getPipelineValueContractIssue } from '@/modules/executable-pipelines/core/pipeline-value-validation';
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
      errors[field.name] = 'Дождитесь подготовки файла.';
      continue;
    }
    const parsed = parseDraft(field, drafts[field.name]);
    if (parsed.error) errors[field.name] = parsed.error;
    if (parsed.value !== undefined) {
      const issue = getPipelineValueContractIssue(parsed.value, { ...field, description: field.description ?? undefined });
      if (issue) errors[field.name] = field.kind === 'json' || field.kind === 'publication'
        ? 'Структура не соответствует формату pipeline. Проверьте пример и обязательные поля.'
        : 'Значение не соответствует типу входа.';
      else input[field.name] = parsed.value;
    }
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
    if (draft !== undefined) return { error: 'Выберите «Да» или «Нет».' };
    return field.required ? { error: 'Выберите вариант.' } : {};
  }

  if (field.kind === 'image' || field.kind === 'audio' || field.kind === 'video') {
    if (isArtifactReference(draft, field.kind)) return { value: draft };
    if (draft !== undefined) return { error: 'Файл не соответствует типу этого входа.' };
    return field.required ? { error: `Добавьте ${field.kind === 'image' ? 'изображение' : field.kind === 'video' ? 'видео' : 'аудиофайл'}.` } : {};
  }

  if (field.kind === 'image_collection') {
    if (Array.isArray(draft) && draft.length > 0 && draft.every((item) => isArtifactReference(item, 'image'))) {
      return { value: draft };
    }
    if (draft !== undefined && (!Array.isArray(draft) || draft.length > 0)) return { error: 'Этот вход принимает только изображения.' };
    return field.required ? { error: 'Добавьте хотя бы одно изображение.' } : {};
  }

  const raw = typeof draft === 'string' ? draft : '';
  if (!raw.trim()) return field.required ? { error: 'Заполните это поле.' } : {};

  if (field.kind === 'text') return { value: raw };
  if (field.kind === 'text_collection') {
    const values = raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    return values.length > 0 ? { value: values } : { error: 'Добавьте хотя бы одну строку.' };
  }
  if (field.kind === 'number') {
    const value = Number(raw);
    return Number.isFinite(value) ? { value } : { error: 'Введите число.' };
  }
  if (field.kind === 'json' || field.kind === 'publication') {
    try {
      const value = JSON.parse(raw) as unknown;
      return isPipelineValue(value) ? { value } : { error: 'Проверьте формат JSON.' };
    } catch {
      return { error: 'Проверьте формат JSON: кавычки, скобки и запятые.' };
    }
  }
  return { error: `Тип «${field.kind}» пока не поддерживается в Playground.` };
}

function isArtifactReference(
  value: PipelinePlaygroundDraft | PipelineArtifactReference,
  kind: 'audio' | 'image' | 'video',
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
