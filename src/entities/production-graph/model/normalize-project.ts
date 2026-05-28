import { defaultExtractPrompt } from './extract-presets';
import { initialProject } from './initial-project';
import { productionLayers } from './production-layers';
import type { GraphEdge, GraphProject, ProductionNode, ProductionNodeData } from './types';

export function normalizeProject(project: GraphProject): GraphProject {
  const nodes = (project.nodes ?? []).map(normalizeNode);
  const edges = (project.edges ?? []).map(normalizeEdge);

  return {
    ...initialProject,
    ...project,
    nodes,
    edges,
    version: 1,
    selectedNodeIds: project.selectedNodeIds ?? [],
  };
}

function normalizeNode(node: ProductionNode): ProductionNode {
  if (node.type === 'importImage') {
    const data = node.data as ProductionNodeData;
    const { prompt: _prompt, ...nextData } = data as unknown as Record<string, unknown>;
    return {
      ...node,
      size: node.size ?? { width: 286, height: 300 },
      data: { title: 'Import', ...nextData },
    } as ProductionNode;
  }

  if (node.type === 'imageToText') {
    const data = node.data as ProductionNodeData;
    const { mode: _mode, aspectRatio: _aspectRatio, size: _size, ...nextData } = data as unknown as Record<string, unknown>;
    const preset = nextData.preset === 'default' || (typeof nextData.preset === 'string' && productionLayers.some((layer) => layer.id === nextData.preset))
      ? nextData.preset
      : 'default';
    const prompt = typeof nextData.prompt === 'string' && nextData.prompt.trim().length > 0
      ? nextData.prompt
      : preset === 'default' ? defaultExtractPrompt : nextData.prompt;
    return {
      ...node,
      data: { model: 'google/gemini-2.5-flash', ...nextData, preset, prompt, title: 'Extract' },
    } as ProductionNode;
  }

  if (node.type === 'generateImage') {
    const data = node.data as ProductionNodeData;
    const { site: _site, ...nextData } = data as unknown as Record<string, unknown>;
    return {
      ...node,
      size: node.size?.width && node.size.width >= 380 ? node.size : { width: 404, height: 720 },
      data: {
        model: 'google/gemini-2.5-flash-image',
        aspectRatio: '16:9',
        size: '1K',
        ...nextData,
        title: 'Generate Image',
      },
    } as ProductionNode;
  }

  return node;
}

function normalizeEdge(edge: GraphEdge) {
  return {
    ...edge,
    sourcePortId: edge.sourcePortId === 'preset' ? 'result' : edge.sourcePortId,
    targetPortId: edge.targetPortId === 'reference' ? 'style' : edge.targetPortId,
  };
}
