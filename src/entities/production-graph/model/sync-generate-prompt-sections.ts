import { getNodeTextResult } from './graph-text-outputs';
import { getGeneratePromptSectionId, getGeneratePromptSectionPortId, type GeneratePromptRoute, type GeneratePromptSection } from './generate-image-prompt-sections';
import { parseTextSectionFilters } from './text-section-filters';
import type { GenerateImageNodeData, GraphEdge, ProductionNode, ProductionNodeData } from './types';

/** Prompt drops become section connections. Source subscriptions are editor metadata, never runtime inputs. */
export function syncGeneratePromptSections(nodes: ProductionNode[], edges: GraphEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const manualEdges = edges.filter((edge) => !edge.promptSourceEdgeId);
  const consumed = new Set<string>();
  const generated: GraphEdge[] = [];
  const nextNodes = nodes.map((node) => {
    if (node.type !== 'generateImage') return node;
    const data = node.data as GenerateImageNodeData;
    const incoming = manualEdges.filter((edge) => edge.targetNodeId === node.id);
    let sources = (data.promptSectionSources ?? []).filter((source) => nodeById.has(source.sourceNodeId));
    for (const edge of incoming) {
      if (edge.targetPortId !== 'prompt') continue;
      const source = nodeById.get(edge.sourceNodeId);
      if (!source || !parseTextSectionFilters(getNodeTextResult(source, edge.sourcePortId, { nodes, edges: manualEdges })).length) continue;
      consumed.add(edge.id);
      sources = sources.filter((item) => item.sourceNodeId !== edge.sourceNodeId || item.sourcePortId !== edge.sourcePortId);
      sources.push({ id: edge.id, sourceNodeId: edge.sourceNodeId, sourcePortId: edge.sourcePortId,
        ...(edge.excludedPromptSectionIds?.length ? { excludedSectionIds: edge.excludedPromptSectionIds } : {}) });
    }
    const sections = new Map<string, GeneratePromptSection>();
    const overrides = new Set(incoming.filter((edge) => getGeneratePromptSectionId(edge.targetPortId)).map((edge) => edge.targetPortId));
    for (const binding of sources) {
      const source = nodeById.get(binding.sourceNodeId)!;
      const text = getNodeTextResult(source, binding.sourcePortId, { nodes, edges: manualEdges });
      for (const section of parseTextSectionFilters(text)) {
        const id = getGeneratePromptSectionPortId(section.id);
        sections.set(id, { id, label: section.label });
        if (binding.excludedSectionIds?.includes(section.id) || overrides.has(id)) continue;
        generated.push({
          id: `prompt-section:${node.id}:${binding.id}:${encodeURIComponent(section.id)}`,
          sourceNodeId: binding.sourceNodeId, sourcePortId: binding.sourcePortId,
          targetNodeId: node.id, targetPortId: id, promptSourceEdgeId: binding.id,
        });
      }
    }
    for (const id of overrides) {
      if (!sections.has(id)) sections.set(id, data.promptSections?.find((section) => section.id === id)
        ?? { id, label: getGeneratePromptSectionId(id)! });
    }
    const promptSections = [...sections.values()];
    if (JSON.stringify(data.promptSections ?? []) === JSON.stringify(promptSections)
      && JSON.stringify(data.promptSectionSources ?? []) === JSON.stringify(sources)) return node;
    return { ...node, data: { ...data, promptSections, promptSectionSources: sources } };
  });
  const generatedById = new Map(generated.map((edge) => [edge.id, edge]));
  const nextEdges = edges.flatMap((edge) => {
    if (consumed.has(edge.id)) return [];
    if (!edge.promptSourceEdgeId) return [edge];
    const replacement = generatedById.get(edge.id);
    if (!replacement) return [];
    generatedById.delete(edge.id);
    return [JSON.stringify(edge) === JSON.stringify(replacement) ? edge : replacement];
  });
  nextEdges.push(...generatedById.values());
  return {
    nodes: nextNodes.every((node, index) => node === nodes[index]) ? nodes : nextNodes,
    edges: nextEdges.length === edges.length && nextEdges.every((edge, index) => edge === edges[index]) ? edges : nextEdges,
  };
}

export function getGeneratePromptRoute(edge: GraphEdge, node: ProductionNode, edges: GraphEdge[]): GeneratePromptRoute | undefined {
  const sectionId = getGeneratePromptSectionId(edge.targetPortId);
  const sections = (node.data as GenerateImageNodeData).promptSections ?? [];
  if (sectionId) return { sectionId, requireSection: Boolean(edge.promptSourceEdgeId), label: sections.find((section) => section.id === edge.targetPortId)?.label ?? sectionId };
  if (edge.targetPortId !== 'prompt') return undefined;
  const routedIds = edges.filter((candidate) => candidate.targetNodeId === node.id && getGeneratePromptSectionId(candidate.targetPortId))
    .map((candidate) => getGeneratePromptSectionId(candidate.targetPortId)!);
  return { omitSectionIds: [...new Set([...routedIds, ...(edge.excludedPromptSectionIds ?? [])])] };
}

export function removeGeneratePromptSectionEdge(nodes: ProductionNode[], edges: GraphEdge[], edge: GraphEdge) {
  const sectionId = getGeneratePromptSectionId(edge.targetPortId);
  return {
    edges: edges.filter((candidate) => candidate.id !== edge.id),
    nodes: !sectionId ? nodes : nodes.map((node) => {
      if (node.id !== edge.targetNodeId || node.type !== 'generateImage') return node;
      const data = node.data as GenerateImageNodeData;
      return { ...node, data: { ...data, promptSectionSources: data.promptSectionSources?.map((source) => (!edge.promptSourceEdgeId || source.id === edge.promptSourceEdgeId)
        ? { ...source, excludedSectionIds: [...new Set([...(source.excludedSectionIds ?? []), sectionId])] } : source) } };
    }),
  };
}

export function remapGeneratePromptSources(data: ProductionNodeData, idMap: Map<string, string>): ProductionNodeData {
  if (!('promptSectionSources' in data)) return data;
  return { ...data, promptSectionSources: data.promptSectionSources?.flatMap((source) => {
    const sourceNodeId = idMap.get(source.sourceNodeId);
    return sourceNodeId ? [{ ...source, sourceNodeId }] : [];
  }) };
}
