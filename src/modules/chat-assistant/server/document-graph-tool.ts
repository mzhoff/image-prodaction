import type { ToolExecutionContext } from '@prodactionpro/chat-connectors';
import { getDocument } from '@/entities/document/server/document-service';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import { PIPELINE_NODE_CONFIGURABLE_FIELDS } from '../contracts/image-production-tools';

const MAX_NODES = 50;
const MAX_EDGES = 100;

export async function readAssistantDocumentGraph(context: ToolExecutionContext) {
  const documentId = readVerifiedDocumentId(context);
  const current = await getDocument(context.userId, documentId);
  if (current.workspaceId !== context.tenantId || current.status !== 'active') {
    throw new Error('The current document cannot be read.');
  }
  const project = current.snapshot?.project;
  const allNodes = project?.nodes ?? [];
  const visibleNodes = allNodes.slice(0, MAX_NODES);
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const allEdges = project?.edges ?? [];
  const visibleEdges = allEdges.filter((edge) => (
    visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId)
  )).slice(0, MAX_EDGES);

  return {
    document: {
      id: current.id,
      name: current.name,
      revision: current.revision,
    },
    edges: visibleEdges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      sourcePortId: edge.sourcePortId,
      targetNodeId: edge.targetNodeId,
      targetPortId: edge.targetPortId,
    })),
    nodes: visibleNodes.map((node) => ({
      configurableSettings: readConfigurableSettings(node.type, node.data as unknown as Record<string, unknown>),
      id: node.id,
      ports: getNodePorts(node).map((port) => ({
        id: port.id,
        kind: port.kind,
        label: port.label,
        side: port.side,
      })),
      position: node.position,
      title: node.data.title,
      type: node.type,
    })),
    truncated: allNodes.length > visibleNodes.length || allEdges.length > visibleEdges.length,
  };
}

function readConfigurableSettings(
  type: keyof typeof PIPELINE_NODE_CONFIGURABLE_FIELDS,
  data: Record<string, unknown>,
) {
  const entries: Array<[string, unknown]> = [];
  for (const field of PIPELINE_NODE_CONFIGURABLE_FIELDS[type]) {
    const value = data[field];
    if (typeof value === 'string') entries.push([field, value.slice(0, 4_000)]);
    if (typeof value === 'number' && Number.isFinite(value)) entries.push([field, value]);
    if (field === 'variables' && Array.isArray(value)) {
      entries.push([field, value.slice(0, 10).flatMap((variable) => (
        isRecord(variable)
          && typeof variable.id === 'string'
          && typeof variable.alias === 'string'
          ? [{ id: variable.id.slice(0, 24), alias: variable.alias.slice(0, 48) }]
          : []
      ))]);
    }
  }
  return Object.fromEntries(entries);
}

function readVerifiedDocumentId(context: ToolExecutionContext) {
  const value = context.verifiedContext?.document;
  if (!isRecord(value) || typeof value.id !== 'string') {
    throw new Error('A verified document context is required.');
  }
  return value.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
