import { createHash } from 'node:crypto';
import { getAssetMetadata } from '@/entities/asset/server/asset-service';
import {
  canonicalizeNodeTemplateSnapshot,
  createNodeTemplateSnapshot,
  filterNodeTemplateAssetIds,
  getNodeTemplateAssetIds,
  NODE_TEMPLATE_PAYLOAD_VERSION,
  type NodeTemplatePreset,
  type NodeTemplateSnapshot,
} from '@/entities/production-graph/model/node-template-preset';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import type { ProductionNodeData, ProductionNodeType } from '@/entities/production-graph/model/types';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { createUuidV7 } from '@/shared/lib/id';
import {
  createDbNodeTemplateRepository,
  type NodeTemplateRecord,
  type NodeTemplateRepository,
} from './node-template-repository';

const MAX_TEMPLATE_PAYLOAD_BYTES = 96 * 1024;
const MAX_TEMPLATES_PER_WORKSPACE = 200;
const MAX_ASSET_REFERENCES = 50;

interface NodeTemplateServiceDependencies {
  createId(): string;
  getAsset(userId: string, assetId: string): Promise<{ status: string; workspaceId: string }>;
  repository: NodeTemplateRepository;
  requireMembership(userId: string, workspaceId: string): Promise<unknown>;
}

export interface SaveNodeTemplateInput {
  data: Record<string, unknown>;
  nodeType: ProductionNodeType;
  userId: string;
  workspaceId: string;
}

export class NodeTemplateValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'NodeTemplateValidationError'; }
}

export class NodeTemplateNotFoundError extends Error {
  constructor() { super('Node template preset not found.'); this.name = 'NodeTemplateNotFoundError'; }
}

export class NodeTemplateLimitError extends Error {
  constructor() { super('Node template limit reached for this workspace.'); this.name = 'NodeTemplateLimitError'; }
}

export async function listNodeTemplates(
  input: { userId: string; workspaceId: string },
  dependencies: NodeTemplateServiceDependencies = createDefaultDependencies(),
) {
  await dependencies.requireMembership(input.userId, input.workspaceId);
  const rows = await dependencies.repository.list(input.userId, input.workspaceId);
  return rows.flatMap((row) => {
    try { return [toNodeTemplatePreset(row)]; } catch { return []; }
  });
}

export async function saveNodeTemplate(
  input: SaveNodeTemplateInput,
  dependencies: NodeTemplateServiceDependencies = createDefaultDependencies(),
) {
  await dependencies.requireMembership(input.userId, input.workspaceId);
  if (!PRODUCTION_NODE_TYPES.includes(input.nodeType)) {
    throw new NodeTemplateValidationError('Unsupported node type.');
  }

  const initialSnapshot = createNodeTemplateSnapshot({
    type: input.nodeType,
    data: input.data as unknown as ProductionNodeData,
  });
  const assetIds = getNodeTemplateAssetIds(initialSnapshot);
  if (assetIds.length > MAX_ASSET_REFERENCES) {
    throw new NodeTemplateValidationError('The template contains too many asset references.');
  }
  const allowedAssetIds = new Set<string>();
  await Promise.all(assetIds.map(async (assetId) => {
    const asset = await dependencies.getAsset(input.userId, assetId).catch(() => null);
    if (asset?.workspaceId === input.workspaceId && asset.status === 'ready') {
      allowedAssetIds.add(assetId);
    }
  }));
  const snapshot = filterNodeTemplateAssetIds(initialSnapshot, allowedAssetIds);
  const serialized = canonicalizeNodeTemplateSnapshot(snapshot);
  const payloadBytes = Buffer.byteLength(serialized, 'utf8');
  if (payloadBytes <= 0 || payloadBytes > MAX_TEMPLATE_PAYLOAD_BYTES) {
    throw new NodeTemplateValidationError('The node template preset is too large.');
  }
  const fingerprint = createHash('sha256').update(serialized).digest('hex');
  const existing = await dependencies.repository.findByFingerprint(
    input.userId,
    input.workspaceId,
    fingerprint,
  );
  if (!existing && await dependencies.repository.count(input.userId, input.workspaceId)
    >= MAX_TEMPLATES_PER_WORKSPACE) {
    throw new NodeTemplateLimitError();
  }

  const saved = await dependencies.repository.upsert({
    fingerprint,
    id: existing?.id ?? dependencies.createId(),
    nodeType: snapshot.nodeType,
    payload: snapshot,
    payloadBytes,
    payloadVersion: NODE_TEMPLATE_PAYLOAD_VERSION,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  return {
    template: toNodeTemplatePreset(saved),
    strippedAssetReferenceCount: assetIds.length - allowedAssetIds.size,
  };
}

export async function deleteNodeTemplate(
  input: { templateId: string; userId: string; workspaceId: string },
  dependencies: NodeTemplateServiceDependencies = createDefaultDependencies(),
) {
  await dependencies.requireMembership(input.userId, input.workspaceId);
  const deleted = await dependencies.repository.delete(
    input.templateId,
    input.userId,
    input.workspaceId,
  );
  if (!deleted) throw new NodeTemplateNotFoundError();
}

function createDefaultDependencies(): NodeTemplateServiceDependencies {
  return {
    createId: createUuidV7,
    getAsset: getAssetMetadata,
    repository: createDbNodeTemplateRepository(),
    requireMembership: requireWorkspaceMembership,
  };
}

function toNodeTemplatePreset(record: NodeTemplateRecord): NodeTemplatePreset {
  if (record.payloadVersion !== NODE_TEMPLATE_PAYLOAD_VERSION
    || !PRODUCTION_NODE_TYPES.includes(record.nodeType as ProductionNodeType)
    || !isNodeTemplateSnapshot(record.payload, record.nodeType as ProductionNodeType)) {
    throw new NodeTemplateValidationError('Node template payload is not supported.');
  }
  return {
    createdAt: record.createdAt.toISOString(),
    fingerprint: record.fingerprint,
    id: record.id,
    snapshot: record.payload,
    updatedAt: record.updatedAt.toISOString(),
    workspaceId: record.workspaceId,
  };
}

function isNodeTemplateSnapshot(
  value: unknown,
  nodeType: ProductionNodeType,
): value is NodeTemplateSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as Partial<NodeTemplateSnapshot>;
  return snapshot.version === NODE_TEMPLATE_PAYLOAD_VERSION
    && snapshot.nodeType === nodeType
    && Boolean(snapshot.data) && typeof snapshot.data === 'object' && !Array.isArray(snapshot.data);
}
