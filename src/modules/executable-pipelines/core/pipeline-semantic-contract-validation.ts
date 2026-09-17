import type {
  PipelineJsonSchema,
  PipelineValueContract,
} from '../contracts/pipeline-contracts';
import type { SemanticContractSnapshot } from '@/shared/contracts/semantic-contract';
import { getSemanticContractSnapshotDefinitionError } from './pipeline-schema-definition-validation';

export function getSemanticBoundaryDefinitionError(
  semanticContract: SemanticContractSnapshot | undefined,
  contracts: Record<string, PipelineValueContract>,
): string | null {
  if (!semanticContract) return null;
  const issue = getSemanticContractSnapshotDefinitionError(semanticContract);
  if (issue) return issue;
  if (semanticContract.schema.type !== 'object') return null;
  const contractKeys = Object.keys(contracts).sort();
  const schemaKeys = Object.keys(semanticContract.schema.properties).sort();
  if (JSON.stringify(contractKeys) !== JSON.stringify(schemaKeys)) {
    return 'properties must match the boundary fields exactly';
  }
  const requiredKeys = new Set(semanticContract.schema.required ?? []);
  for (const [key, contract] of Object.entries(contracts)) {
    const schema = semanticContract.schema.properties[key];
    if (!schema || !isSchemaCompatibleWithKind(schema.type, contract.kind)) {
      return `property "${key}" does not match kind "${contract.kind}"`;
    }
    if (contract.required !== requiredKeys.has(key)) {
      return `property "${key}" has conflicting required metadata`;
    }
    if (contract.defaultValue !== undefined) {
      return `property "${key}" cannot define a default outside the embedded schema`;
    }
    if (
      contract.kind === 'json'
      && (!contract.schema || stableStringify(contract.schema) !== stableStringify(schema))
    ) {
      return `property "${key}" must use the exact embedded JSON schema`;
    }
  }
  return null;
}

function isSchemaCompatibleWithKind(
  schemaType: PipelineJsonSchema['type'],
  kind: PipelineValueContract['kind'],
) {
  if (kind === 'text') return schemaType === 'string';
  if (kind === 'number') return schemaType === 'number' || schemaType === 'integer';
  if (kind === 'boolean') return schemaType === 'boolean';
  if (kind === 'json' || kind === 'publication') return schemaType === 'object' || schemaType === 'array';
  if (kind === 'image' || kind === 'audio' || kind === 'video') return schemaType === 'object';
  if (kind === 'image_collection' || kind === 'text_collection') return schemaType === 'array';
  return false;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(record[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}
