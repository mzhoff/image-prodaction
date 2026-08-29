import type {
  PipelineArtifactReference,
  PipelineJsonSchema,
  PipelineValue,
  PipelineValueContract,
  PipelineValueKind,
} from '../contracts/pipeline-contracts';

const PIPELINE_VALUE_KINDS = new Set<PipelineValueKind>([
  'audio',
  'boolean',
  'image',
  'image_collection',
  'json',
  'number',
  'publication',
  'text',
  'text_collection',
]);
const MAX_SCHEMA_DEPTH = 5;
const MAX_SCHEMA_PROPERTIES = 64;
const MAX_JSON_VALUE_DEPTH = 8;
const MAX_JSON_COLLECTION_ITEMS = 4_096;

export function getPipelineValueContractDefinitionError(
  contract: PipelineValueContract,
): string | null {
  if (!PIPELINE_VALUE_KINDS.has(contract.kind)) return 'kind is not supported';
  if (typeof contract.required !== 'boolean') return 'required must be a boolean';
  if (contract.description !== undefined && typeof contract.description !== 'string') {
    return 'description must be a string';
  }
  if (contract.schema !== undefined) {
    if (contract.kind !== 'json') return 'schema is only supported for json contracts';
    if (contract.schema.type !== 'object' && contract.schema.type !== 'array') {
      return 'a json contract schema must describe an object or array';
    }
    const schemaError = getPipelineJsonSchemaDefinitionError(contract.schema);
    if (schemaError) return `schema ${schemaError}`;
  }
  if (Object.hasOwn(contract, 'defaultValue')) {
    const issue = getPipelineValueContractIssue(contract.defaultValue as PipelineValue, contract);
    if (issue) return `defaultValue ${issue}`;
  }
  return null;
}

export function getPipelineJsonSchemaDefinitionError(
  schema: PipelineJsonSchema,
  depth = 0,
): string | null {
  if (!isRecord(schema)) return 'must be an object';
  if (depth >= MAX_SCHEMA_DEPTH) return `exceeds maximum depth ${MAX_SCHEMA_DEPTH}`;
  if (schema.description !== undefined && typeof schema.description !== 'string') {
    return 'description must be a string';
  }

  if (schema.type === 'object') {
    if (schema.additionalProperties !== false) return 'must set additionalProperties to false';
    if (!isRecord(schema.properties)) return 'properties must be an object';
    const entries = Object.entries(schema.properties);
    if (entries.length > MAX_SCHEMA_PROPERTIES) {
      return `contains more than ${MAX_SCHEMA_PROPERTIES} properties`;
    }
    const required = schema.required ?? [];
    if (!Array.isArray(required) || required.some((key) => typeof key !== 'string')) {
      return 'required must be a string array';
    }
    if (new Set(required).size !== required.length) return 'required contains duplicate keys';
    if (required.some((key) => !Object.hasOwn(schema.properties, key))) {
      return 'required references an unknown property';
    }
    for (const [key, child] of entries) {
      if (!isPublicContractKey(key)) return `property "${key}" has an invalid format`;
      const childError = getPipelineJsonSchemaDefinitionError(child, depth + 1);
      if (childError) return `property "${key}" ${childError}`;
    }
    return null;
  }

  if (schema.type === 'array') {
    if (!schema.items) return 'array items are required';
    const childError = getPipelineJsonSchemaDefinitionError(schema.items, depth + 1);
    return childError ? `array items ${childError}` : null;
  }

  if (schema.type === 'string') return validateEnum(schema.enum, 'string');
  if (schema.type === 'boolean') return validateEnum(schema.enum, 'boolean');
  if (schema.type === 'number' || schema.type === 'integer') {
    return validateNumberEnum(schema.enum, schema.type === 'integer');
  }
  return 'type is not supported';
}

export function getPipelineValueContractIssue(
  value: PipelineValue,
  contract: PipelineValueContract,
): string | null {
  if (contract.kind === 'boolean') return typeof value === 'boolean' ? null : 'must be a boolean';
  if (contract.kind === 'number') {
    return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a finite number';
  }
  if (contract.kind === 'text') return typeof value === 'string' ? null : 'must be text';
  if (contract.kind === 'text_collection') {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
      ? null
      : 'must be a text collection';
  }
  if (contract.kind === 'image_collection') {
    return Array.isArray(value) && value.every((entry) => isPipelineArtifactReference(entry, 'image'))
      ? null
      : 'must be an image collection';
  }
  if (contract.kind === 'image') {
    return isPipelineArtifactReference(value, 'image') ? null : 'must be an image artifact';
  }
  if (contract.kind === 'audio') {
    return isPipelineArtifactReference(value, 'audio') ? null : 'must be an audio artifact';
  }
  if (contract.kind === 'json') {
    if (!isJsonContainer(value) || !isSafeJsonValue(value)) return 'must be structured JSON';
    return contract.schema ? getPipelineJsonValueIssue(value, contract.schema) : null;
  }
  return isRecord(value) && isSafeJsonValue(value) ? null : 'must be a structured object';
}

export function getPipelineJsonValueIssue(
  value: PipelineValue,
  schema: PipelineJsonSchema,
  path = '$',
): string | null {
  if (schema.type === 'string') {
    if (typeof value !== 'string') return `${path} must be a string`;
    return schema.enum && !schema.enum.includes(value) ? `${path} is not in the allowed enum` : null;
  }
  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') return `${path} must be a boolean`;
    return schema.enum && !schema.enum.includes(value) ? `${path} is not in the allowed enum` : null;
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${path} must be a finite number`;
    if (schema.type === 'integer' && !Number.isInteger(value)) return `${path} must be an integer`;
    return schema.enum && !schema.enum.includes(value) ? `${path} is not in the allowed enum` : null;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return `${path} must be an array`;
    if (value.length > MAX_JSON_COLLECTION_ITEMS) return `${path} contains too many items`;
    for (const [index, entry] of value.entries()) {
      const issue = getPipelineJsonValueIssue(entry, schema.items, `${path}[${index}]`);
      if (issue) return issue;
    }
    return null;
  }
  if (!isRecord(value)) return `${path} must be an object`;
  const allowed = new Set(Object.keys(schema.properties));
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) return `${path}.${unknown} is not allowed`;
  const missing = (schema.required ?? []).find((key) => value[key] === undefined);
  if (missing) return `${path}.${missing} is required`;
  for (const [key, childSchema] of Object.entries(schema.properties)) {
    const child = value[key];
    if (child === undefined) continue;
    const issue = getPipelineJsonValueIssue(child, childSchema, `${path}.${key}`);
    if (issue) return issue;
  }
  return null;
}

export function isPipelineArtifactReference(
  value: PipelineValue,
  kind?: PipelineArtifactReference['kind'],
): value is PipelineArtifactReference & Record<string, PipelineValue> {
  if (!isRecord(value)) return false;
  if (value.kind !== 'image' && value.kind !== 'audio') return false;
  if (kind && value.kind !== kind) return false;
  if (typeof value.assetId !== 'string' || !value.assetId.trim()) return false;
  if (value.mimeType !== undefined && typeof value.mimeType !== 'string') return false;
  if (value.sizeBytes !== undefined && (
    typeof value.sizeBytes !== 'number'
    || !Number.isSafeInteger(value.sizeBytes)
    || value.sizeBytes < 0
  )) return false;
  return true;
}

export function isPublicContractKey(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]{0,119}$/.test(value);
}

function validateEnum(value: unknown, type: 'boolean' | 'string') {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) return 'enum is invalid';
  return value.every((entry) => typeof entry === type) ? null : `enum must contain only ${type} values`;
}

function validateNumberEnum(value: unknown, integer: boolean) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) return 'enum is invalid';
  return value.every((entry) => (
    typeof entry === 'number' && Number.isFinite(entry) && (!integer || Number.isInteger(entry))
  )) ? null : 'enum must contain only valid numbers';
}

function isJsonContainer(value: PipelineValue) {
  return Array.isArray(value) || isRecord(value);
}

function isSafeJsonValue(value: PipelineValue, depth = 0): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth >= MAX_JSON_VALUE_DEPTH) return false;
  if (Array.isArray(value)) {
    return value.length <= MAX_JSON_COLLECTION_ITEMS
      && value.every((entry) => isSafeJsonValue(entry, depth + 1));
  }
  const entries = Object.entries(value);
  return entries.length <= MAX_JSON_COLLECTION_ITEMS
    && entries.every(([, entry]) => isSafeJsonValue(entry, depth + 1));
}

function isRecord(value: unknown): value is Record<string, PipelineValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
