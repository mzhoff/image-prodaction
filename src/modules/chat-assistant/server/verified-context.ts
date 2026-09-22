import { verifiedStoryContext } from './story-conversation';
import { verifiedTimelineContext } from './timeline-conversation';
import type { VerifiedContextResolver } from '@prodactionpro/chat-application';
import { ChatAccessError } from '@prodactionpro/chat-server-core';
import { getDocument } from '@/entities/document/server/document-service';
import { getAssistantNodeCatalog } from '../core/node-catalog';
import { isHomeConversation } from './home-conversation-service';
import { selectedHomeMode } from './home-conversation-mode';
import { readHomeImageSettings } from './home-image-settings-service';
import { assertProductionChatWritable } from './production-chat-service';

export const resolveVerifiedChatContext: VerifiedContextResolver = async ({
  principal,
  selectors,
  conversationId,
}) => {
  const workspaceId = principal.tenantId;
  if (!workspaceId) throw new ChatAccessError('A verified workspace is required.', 'forbidden');
  await assertProductionChatWritable(principal, conversationId);

  const timeline = await verifiedTimelineContext(principal, conversationId);
  if (timeline) return { workspaceId, timeline, route: selectors?.route,
    timelineHasUnsavedChanges: selectors?.document?.id === timeline.id && selectors.document.revision?.startsWith('unsaved:') === true };

  const storyBlueprint = await verifiedStoryContext(principal, conversationId);
  if (storyBlueprint) return { workspaceId, storyBlueprint, route: selectors?.route,
    focusedStoryCharacterId: storyBlueprint.characters?.find((character) => character.id === storyCharacterSelector(selectors?.route))?.id,
    storyAuthoringRevision: selectors?.document?.id === storyBlueprint.id && selectors.document.revision === String(storyBlueprint.revision)
      ? storyBlueprint.revision : undefined };

  const homeConversation = await isHomeConversation(principal, conversationId);
  const pinnedImage = homeConversation ? await readHomeImageSettings(principal, conversationId, selectors) : undefined;
  const baseContext = {
    availableNodeTypeCount: getAssistantNodeCatalog().length,
    route: selectors?.route,
    workspaceId,
    homeConversation,
    ...(homeConversation ? { homeMode: await selectedHomeMode(conversationId) } : {}),
    ...(pinnedImage ? { homeImageSettings: { ...pinnedImage.settings,
      subjects: pinnedImage.subjects.map(({ id, name, passportText }) => ({ id, name, summary: passportText.slice(0, 600) })),
    } } : {}),
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

function storyCharacterSelector(route?: string) {
  try { return new URL(route || '/', 'https://production.local').searchParams.get('character'); } catch { return null; }
}
