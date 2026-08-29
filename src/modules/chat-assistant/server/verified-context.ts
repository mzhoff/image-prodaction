import type { VerifiedContextResolver } from '@prodactionpro/chat-application';
import { ChatAccessError } from '@prodactionpro/chat-server-core';
import { getDocument } from '@/entities/document/server/document-service';
import { getAssistantNodeCatalog } from '../core/node-catalog';

export const resolveVerifiedChatContext: VerifiedContextResolver = async ({
  principal,
  selectors,
}) => {
  const workspaceId = principal.tenantId;
  if (!workspaceId) throw new ChatAccessError('A verified workspace is required.', 'forbidden');

  const baseContext = {
    availableNodeTypeCount: getAssistantNodeCatalog().length,
    route: selectors?.route,
    workspaceId,
  };
  const documentSelector = selectors?.document;
  if (!documentSelector) return baseContext;

  const project = await getDocument(principal.userId, documentSelector.id);
  if (project.workspaceId !== workspaceId) {
    throw new ChatAccessError('The document belongs to another workspace.', 'forbidden');
  }
  const graph = project.snapshot?.project;
  const selectedIds = new Set(selectors?.selection?.ids ?? []);
  const selectedNodes = graph?.nodes.filter((node) => selectedIds.has(node.id)) ?? [];
  const selectedSections = graph?.sections.filter((section) => selectedIds.has(section.id)) ?? [];

  return {
    ...baseContext,
    document: {
      edgeCount: graph?.edges.length ?? 0,
      id: project.id,
      name: project.name,
      nodeCount: graph?.nodes.length ?? 0,
      nodeTypes: graph ? countNodeTypes(graph.nodes.map((node) => node.type)) : {},
      revision: project.revision,
      selectedNodeIds: selectedNodes.map((node) => node.id),
      selectedNodeTypes: selectedNodes.map((node) => node.type),
      selectedSectionIds: selectedSections.map((section) => section.id),
      selectorHasUnsavedChanges: documentSelector.revision?.startsWith('unsaved:') ?? false,
      selectorRevisionMatches: documentSelector.revision === undefined
        ? undefined
        : documentSelector.revision === String(project.revision),
      status: project.status,
    },
  };
};

function countNodeTypes(types: string[]) {
  return types.reduce<Record<string, number>>((counts, type) => {
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
}
