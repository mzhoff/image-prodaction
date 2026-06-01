import { buildExtractPrompt, defaultExtractPrompt, normalizeExtractPresetSelection } from './extract-presets';
import { getGenerationHistory, type GenerationHistoryData } from './generation-history';
import { initialProject } from './initial-project';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO, normalizeNodeSize } from './node-layout';
import { productionLayers } from './production-layers';
import { PROJECT_SCHEMA_VERSION } from './project-schema';
import type { ExtractPresetId, GraphEdge, GraphProject, ProductionNode, ProductionNodeData } from './types';

export function normalizeProject(project: GraphProject): GraphProject {
  const nodes = (project.nodes ?? []).map(normalizeNode);
  const edges = (project.edges ?? []).map((edge) => normalizeEdge(edge, nodes));
  const sections = (project.sections ?? []).map((section, index) => normalizeSection(section, index));
  const sectionIds = new Set(sections.map((section) => section.id));

  return {
    ...initialProject,
    ...project,
    nodes,
    sections,
    edges,
    version: PROJECT_SCHEMA_VERSION,
    selectedNodeIds: project.selectedNodeIds ?? [],
    selectedSectionIds: (project.selectedSectionIds ?? []).filter((id) => sectionIds.has(id)),
  };
}

function normalizeSection(section: GraphProject['sections'][number], index: number) {
  return {
    id: section.id || `section-${index + 1}`,
    title: section.title || `Section ${index + 1}`,
    position: section.position ?? { x: 0, y: 0 },
    size: section.size ?? { width: 640, height: 420 },
  };
}

function normalizeNode(node: ProductionNode): ProductionNode {
  if (node.type === 'importImage') {
    const data = node.data as ProductionNodeData;
    const { prompt: _prompt, ...nextData } = data as unknown as Record<string, unknown>;
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: { title: 'Import', ...nextData },
    } as ProductionNode;
  }

  if (node.type === 'imageToText') {
    const data = node.data as ProductionNodeData;
    const { mode: _mode, aspectRatio: _aspectRatio, size: _size, ...nextData } = data as unknown as Record<string, unknown>;
    const legacyPreset = nextData.preset === 'default' || (typeof nextData.preset === 'string' && productionLayers.some((layer) => layer.id === nextData.preset))
      ? nextData.preset as ExtractPresetId
      : 'default';
    const rawPresets = Array.isArray(nextData.presets)
      ? nextData.presets.filter((preset): preset is ExtractPresetId => typeof preset === 'string')
      : legacyPreset;
    const presets = normalizeExtractPresetSelection(rawPresets);
    const nextPrompt = presets.includes('default') ? defaultExtractPrompt : buildExtractPrompt(presets).systemPrompt;
    const storedPrompt = typeof nextData.prompt === 'string' ? nextData.prompt : '';
    const prompt = storedPrompt.trim().length > 0 && !isLegacyExtractPrompt(storedPrompt, legacyPreset)
      ? storedPrompt
      : nextPrompt;
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: { model: 'google/gemini-2.5-flash', ...nextData, preset: presets[0], presets, prompt, title: 'Extract' },
    } as ProductionNode;
  }

  if (node.type === 'referenceComposer') {
    const data = node.data as ProductionNodeData & { slots?: unknown };
    const slots = Array.isArray(data.slots)
      ? data.slots
      : productionLayers.map((layer) => ({ id: layer.id, label: layer.label }));
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        model: 'google/gemini-2.5-flash-image',
        aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
        size: '1K',
        prompt: '',
        ...data,
        slots,
        title: 'Generate Image',
      },
    } as ProductionNode;
  }

  if (node.type === 'generateImage') {
    const data = node.data as ProductionNodeData;
    const { site: _site, ...nextData } = data as unknown as Record<string, unknown>;
    const history = getGenerationHistory(nextData as unknown as GenerationHistoryData);
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        model: 'google/gemini-2.5-flash-image',
        aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
        size: '1K',
        ...nextData,
        activeResultIndex: history.activeIndex,
        resultAssetId: history.activeAssetId,
        resultAssetIds: history.assetIds,
        title: 'Generate Image',
      },
    } as ProductionNode;
  }

  if (node.type === 'exportImage') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        format: 'png',
        quality: '90',
        scale: '1',
        background: 'transparent',
        ...node.data,
        title: 'Export',
      },
    } as ProductionNode;
  }

  if (node.type === 'sketch') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
        brushColor: '#111111',
        brushSize: '48',
        ...node.data,
        title: 'Sketch',
      },
    } as ProductionNode;
  }

  if (node.type === 'cropImage') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        aspectRatio: 'Custom',
        locked: false,
        ...node.data,
        title: 'Crop',
      },
    } as ProductionNode;
  }

  if (node.type === 'adjustment') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        exposure: 0,
        gamma: 0,
        contrast: 0,
        saturation: 0,
        temperature: 0,
        tint: 0,
        highlights: 0,
        shadows: 0,
        ...node.data,
        title: 'Adjustments',
      },
    } as ProductionNode;
  }

  if (node.type === 'removeBackground') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        ...node.data,
        title: 'Remove BG',
      },
    } as ProductionNode;
  }

  if (node.type === 'preview') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        ...node.data,
        title: 'Preview',
      },
    } as ProductionNode;
  }

  return {
    ...node,
    size: normalizeNodeSize(node.type, node.size),
  };
}

function isLegacyExtractPrompt(prompt: string, preset: ExtractPresetId) {
  const trimmed = prompt.trim();
  if (preset !== 'default') {
    return productionLayers.some((layer) => layer.id === preset && layer.prompt.trim() === trimmed);
  }

  return trimmed.includes('[SUBJECT / PRODUCT]')
    && trimmed.includes('[NEGATIVE CONSTRAINTS]')
    && trimmed.includes('Сделай максимально подробный production-ready prompt')
    || trimmed.includes('[REFERENCE EXCLUSIONS FOR UNSELECTED LAYERS]')
    || trimmed.includes('[GLOBAL NEGATIVE CONSTRAINTS]')
    || trimmed.includes('[ROUTING]');
}

function normalizeEdge(edge: GraphEdge, nodes: ProductionNode[]) {
  const source = nodes.find((node) => node.id === edge.sourceNodeId);
  const shouldRenameImageOutput = (
    (source?.type === 'cropImage' || source?.type === 'removeBackground')
    && edge.sourcePortId === 'image'
  );

  return {
    ...edge,
    sourcePortId: shouldRenameImageOutput
      ? 'result'
      : edge.sourcePortId === 'preset' ? 'result' : edge.sourcePortId,
    targetPortId: edge.targetPortId === 'reference' ? 'style' : edge.targetPortId,
  };
}
