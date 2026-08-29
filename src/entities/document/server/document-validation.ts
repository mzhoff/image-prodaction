import { PROJECT_SCHEMA_VERSION } from '@/entities/production-graph/model/project-schema';
import type { ProjectExport } from '@/entities/production-graph/model/project-schema';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import { validatePipelineContractFields } from '@/entities/production-graph/model/pipeline-contract-fields';

export const MAX_DOCUMENT_SNAPSHOT_BYTES = 5 * 1024 * 1024;

export class DocumentValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DocumentValidationError';
    this.code = code;
  }
}

export function validateDocumentSnapshot(value: unknown): ProjectExport {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new DocumentValidationError('invalid_snapshot', 'Document snapshot must be JSON serializable.');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DOCUMENT_SNAPSHOT_BYTES) {
    throw new DocumentValidationError('snapshot_too_large', 'Document snapshot exceeds the 5 MB limit.');
  }

  if (!isRecord(value)
    || value.kind !== 'projectSnapshot'
    || value.schemaVersion !== PROJECT_SCHEMA_VERSION
    || typeof value.exportedAt !== 'string'
    || !isRecord(value.project)
    || !Array.isArray(value.project.nodes)
    || !Array.isArray(value.project.edges)
    || !isRecord(value.uiState)
    || !Array.isArray(value.assetsManifest)) {
    throw new DocumentValidationError('invalid_snapshot', 'Document snapshot has an unsupported structure or version.');
  }

  if (value.project.nodes.length > 2_000 || value.project.edges.length > 10_000 || value.assetsManifest.length > 5_000) {
    throw new DocumentValidationError('snapshot_limits_exceeded', 'Document snapshot contains too many records.');
  }

  validateGraphNodes(value.project.nodes);

  return value as unknown as ProjectExport;
}

function validateGraphNodes(nodes: unknown[]) {
  const supportedTypes = new Set<string>(PRODUCTION_NODE_TYPES);
  for (const [index, node] of nodes.entries()) {
    if (!isRecord(node)
      || typeof node.id !== 'string'
      || !supportedTypes.has(String(node.type))
      || !isRecord(node.data)) {
      throw new DocumentValidationError('invalid_snapshot', `Document node ${index} has an unsupported structure.`);
    }
    if (node.type !== 'pipelineInput' && node.type !== 'pipelineOutput' && node.type !== 'structuredOutput') continue;
    const fieldErrors = validatePipelineContractFields(node.data.fields);
    if (fieldErrors.length > 0) {
      throw new DocumentValidationError(
        'invalid_pipeline_contract',
        `Document node ${index} has an invalid pipeline contract: ${fieldErrors[0]}`,
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
