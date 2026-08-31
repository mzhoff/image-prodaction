import type { SemanticContractSnapshot } from '@/shared/contracts/semantic-contract';
import type { PipelineJsonSchema } from '../contracts/pipeline-contracts';

const MAX_SCHEMA_DEPTH = 5;
const MAX_SCHEMA_PROPERTIES = 64;

export function getPipelineJsonSchemaDefinitionError(
  schema: PipelineJsonSchema,
  depth = 0,
): string | null {
  if (!isRecord(schema)) return 'must be an object';
  if (depth >= MAX_SCHEMA_DEPTH) return `exceeds maximum depth ${MAX_SCHEMA_DEPTH}`;
  if (schema.description !== undefined && typeof schema.description !== 'string') {
    return 'description must be a string';
  }
  if (schema.title !== undefined && typeof schema.title !== 'string') {
    return 'title must be a string';
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
    const boundsError = validateIntegerBounds(schema.minItems, schema.maxItems, 'items');
    if (boundsError) return boundsError;
    const childError = getPipelineJsonSchemaDefinitionError(schema.items, depth + 1);
    return childError ? `array items ${childError}` : null;
  }

  if (schema.type === 'string') {
    const boundsError = validateIntegerBounds(schema.minLength, schema.maxLength, 'length');
    const patternError = validateSafeStringPattern(schema.pattern);
    return boundsError ?? patternError ?? validateEnum(schema.enum, 'string');
  }
  if (schema.type === 'boolean') return validateEnum(schema.enum, 'boolean');
  if (schema.type === 'number' || schema.type === 'integer') {
    const boundsError = validateNumberBounds(schema.minimum, schema.maximum);
    return boundsError ?? validateNumberEnum(schema.enum, schema.type === 'integer');
  }
  return 'type is not supported';
}

export function getSemanticContractSnapshotDefinitionError(
  contract: SemanticContractSnapshot,
): string | null {
  if (!contract || typeof contract !== 'object') return 'must be an object';
  if (
    typeof contract.contractKey !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(contract.contractKey)
  ) {
    return 'contractKey has an invalid format';
  }
  if (
    typeof contract.contractVersion !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(contract.contractVersion)
  ) {
    return 'contractVersion has an invalid format';
  }
  if (
    typeof contract.contractRef !== 'string'
    || !contract.contractRef.trim()
    || contract.contractRef.length > 500
  ) {
    return 'contractRef is invalid';
  }
  if (
    typeof contract.schemaChecksum !== 'string'
    || !/^[a-f0-9]{64}$/.test(contract.schemaChecksum)
  ) {
    return 'schemaChecksum must be a lowercase SHA-256 digest';
  }
  if (!isRecord(contract.schema)) return 'schema must be an object';
  if (contract.schema.type !== 'object') return 'schema must describe the full boundary object';
  const schemaError = getPipelineJsonSchemaDefinitionError(contract.schema);
  return schemaError ? `schema ${schemaError}` : null;
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

function validateSafeStringPattern(value: unknown) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 128) return 'pattern is invalid';
  if (!/^\^\[[A-Za-z0-9_-]+\]\{[1-9][0-9]{0,3}(?:,[1-9][0-9]{0,3})?\}\$$/.test(value)) {
    return 'pattern must be an anchored bounded character class';
  }
  try {
    new RegExp(value);
    return null;
  } catch {
    return 'pattern is invalid';
  }
}

function validateIntegerBounds(minimum: unknown, maximum: unknown, label: string) {
  if (minimum !== undefined && (!Number.isSafeInteger(minimum) || Number(minimum) < 0)) {
    return `minimum ${label} must be a non-negative integer`;
  }
  if (maximum !== undefined && (!Number.isSafeInteger(maximum) || Number(maximum) < 0)) {
    return `maximum ${label} must be a non-negative integer`;
  }
  if (minimum !== undefined && maximum !== undefined && Number(minimum) > Number(maximum)) {
    return `minimum ${label} must not exceed maximum ${label}`;
  }
  return null;
}

function validateNumberBounds(minimum: unknown, maximum: unknown) {
  if (minimum !== undefined && (typeof minimum !== 'number' || !Number.isFinite(minimum))) {
    return 'minimum must be a finite number';
  }
  if (maximum !== undefined && (typeof maximum !== 'number' || !Number.isFinite(maximum))) {
    return 'maximum must be a finite number';
  }
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    return 'minimum must not exceed maximum';
  }
  return null;
}

function isPublicContractKey(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]{0,119}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, PipelineJsonSchema> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
