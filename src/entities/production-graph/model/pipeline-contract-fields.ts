import { createId } from '@/shared/lib/id';

export const PIPELINE_CONTRACT_FIELD_KINDS = ['text', 'number', 'boolean', 'image', 'json'] as const;
export type PipelineContractFieldKind = (typeof PIPELINE_CONTRACT_FIELD_KINDS)[number];

export type PipelineContractValue =
  | boolean
  | number
  | string
  | null
  | PipelineContractValue[]
  | { [key: string]: PipelineContractValue };

export interface PipelineContractField {
  defaultValue?: PipelineContractValue;
  description?: string;
  fields?: PipelineContractField[];
  id: string;
  key: string;
  kind: PipelineContractFieldKind;
  required: boolean;
}

export const PIPELINE_CONTRACT_MAX_DEPTH = 3;
export const PIPELINE_CONTRACT_MAX_FIELDS = 24;
export const PIPELINE_FIELD_PORT_PREFIX = 'field:';

export function createPipelineContractField(
  index = 0,
  overrides: Partial<PipelineContractField> = {},
): PipelineContractField {
  const kind = isPipelineContractFieldKind(overrides.kind) ? overrides.kind : 'text';
  return {
    id: typeof overrides.id === 'string' && overrides.id.trim()
      ? overrides.id.trim()
      : createId('field'),
    key: typeof overrides.key === 'string' && overrides.key.trim()
      ? overrides.key.trim()
      : `field_${index + 1}`,
    kind,
    required: typeof overrides.required === 'boolean' ? overrides.required : true,
    ...(typeof overrides.description === 'string' && overrides.description.trim()
      ? { description: overrides.description.trim() }
      : undefined),
    ...(overrides.defaultValue !== undefined ? { defaultValue: overrides.defaultValue } : undefined),
    ...(kind === 'json'
      ? { fields: normalizePipelineContractFields(overrides.fields, { depth: 1 }) }
      : undefined),
  };
}

export function getPipelineFieldPortId(fieldId: string) {
  return `${PIPELINE_FIELD_PORT_PREFIX}${fieldId}`;
}

export function getPipelineFieldIdFromPortId(portId: string) {
  if (!portId.startsWith(PIPELINE_FIELD_PORT_PREFIX)) return null;
  const fieldId = portId.slice(PIPELINE_FIELD_PORT_PREFIX.length).trim();
  return fieldId || null;
}

export function isPipelineContractFieldKind(value: unknown): value is PipelineContractFieldKind {
  return typeof value === 'string'
    && (PIPELINE_CONTRACT_FIELD_KINDS as readonly string[]).includes(value);
}

export function isValidPipelineFieldKey(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

export function validatePipelineContractFields(value: unknown): string[] {
  const errors: string[] = [];
  const usedIds = new Set<string>();
  validateFieldArray(value, 0, 'fields', usedIds, errors);
  return errors;
}

export function normalizePipelineContractFields(
  value: unknown,
  options: { depth?: number } = {},
): PipelineContractField[] {
  const depth = options.depth ?? 0;
  if (!Array.isArray(value) || depth >= PIPELINE_CONTRACT_MAX_DEPTH) return [];

  const usedIds = new Set<string>();
  return value.slice(0, PIPELINE_CONTRACT_MAX_FIELDS).map((candidate, index) => {
    const record = isRecord(candidate) ? candidate : {};
    const kind = isPipelineContractFieldKind(record.kind) ? record.kind : 'text';
    const rawId = typeof record.id === 'string' ? record.id.trim() : '';
    let id = rawId || createId('field');
    if (usedIds.has(id)) id = createId('field');
    usedIds.add(id);

    const rawKey = typeof record.key === 'string' ? record.key.trim() : '';
    const field: PipelineContractField = {
      id,
      key: rawKey || `field_${index + 1}`,
      kind,
      required: typeof record.required === 'boolean' ? record.required : true,
    };
    if (typeof record.description === 'string' && record.description.trim()) {
      field.description = record.description.trim();
    }
    if (record.defaultValue !== undefined && isPipelineContractValue(record.defaultValue)) {
      field.defaultValue = record.defaultValue;
    }
    if (kind === 'json') {
      field.fields = normalizePipelineContractFields(record.fields, { depth: depth + 1 });
    }
    return field;
  });
}

export function isPipelineContractValue(value: unknown): value is PipelineContractValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) return value.every(isPipelineContractValue);
  return isRecord(value) && Object.values(value).every(isPipelineContractValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateFieldArray(
  value: unknown,
  depth: number,
  path: string,
  usedIds: Set<string>,
  errors: string[],
) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  if (depth >= PIPELINE_CONTRACT_MAX_DEPTH) {
    if (!Array.isArray(value) || value.length > 0) {
      errors.push(`${path} exceeds the maximum JSON depth of ${PIPELINE_CONTRACT_MAX_DEPTH}.`);
    }
    return;
  }
  if (value.length > PIPELINE_CONTRACT_MAX_FIELDS) {
    errors.push(`${path} exceeds the maximum of ${PIPELINE_CONTRACT_MAX_FIELDS} fields.`);
  }

  const keys = new Set<string>();
  value.slice(0, PIPELINE_CONTRACT_MAX_FIELDS + 1).forEach((candidate, index) => {
    const fieldPath = `${path}[${index}]`;
    if (!isRecord(candidate)) {
      errors.push(`${fieldPath} must be an object.`);
      return;
    }
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    if (!id) errors.push(`${fieldPath}.id is required.`);
    else if (usedIds.has(id)) errors.push(`${fieldPath}.id must be unique.`);
    else usedIds.add(id);

    const key = typeof candidate.key === 'string' ? candidate.key.trim() : '';
    if (!isValidPipelineFieldKey(key)) errors.push(`${fieldPath}.key has an invalid public name.`);
    else if (keys.has(key)) errors.push(`${fieldPath}.key must be unique within its object.`);
    else keys.add(key);

    if (!isPipelineContractFieldKind(candidate.kind)) {
      errors.push(`${fieldPath}.kind is unsupported.`);
      return;
    }
    if (typeof candidate.required !== 'boolean') errors.push(`${fieldPath}.required must be boolean.`);
    if (candidate.description !== undefined && typeof candidate.description !== 'string') {
      errors.push(`${fieldPath}.description must be text.`);
    }
    if (candidate.defaultValue !== undefined && !isPipelineContractValue(candidate.defaultValue)) {
      errors.push(`${fieldPath}.defaultValue must be JSON-compatible.`);
    }

    if (candidate.kind === 'json') {
      validateFieldArray(candidate.fields ?? [], depth + 1, `${fieldPath}.fields`, usedIds, errors);
    } else if (candidate.fields !== undefined) {
      errors.push(`${fieldPath}.fields is allowed only for a JSON object.`);
    }
  });
}
