import { buildExtractPrompt, defaultExtractPrompt, normalizeExtractPresetSelection } from './extract-presets';
import { getGenerationHistory, type GenerationHistoryData } from './generation-history';
import { initialProject } from './initial-project';
import { TEXT_CONCAT_MIN_INPUTS, getTextConcatInputPortId, getTextConcatInputPortIndex } from './node-definitions';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO, normalizeNodeSize } from './node-layout';
import { productionLayers } from './production-layers';
import { PROJECT_SCHEMA_VERSION } from './project-schema';
import type { ExtractPresetId, GraphEdge, GraphProject, ProductionNode, ProductionNodeData } from './types';
import { normalizeCurves } from '@/shared/lib/image-renderer/curves';

export function normalizeProject(project: GraphProject): GraphProject {
  const nodes = (project.nodes ?? []).map(normalizeNode);
  const edges = normalizeTextConcatEdges((project.edges ?? []).map((edge) => normalizeEdge(edge, nodes)), nodes);
  const nodesWithPortCounts = normalizeTextConcatInputCounts(nodes, edges);
  const sections = (project.sections ?? []).map((section, index) => normalizeSection(section, index));
  const sectionIds = new Set(sections.map((section) => section.id));

  return {
    ...initialProject,
    ...project,
    nodes: nodesWithPortCounts,
    sections,
    edges,
    version: PROJECT_SCHEMA_VERSION,
    selectedNodeIds: project.selectedNodeIds ?? [],
    selectedSectionIds: (project.selectedSectionIds ?? []).filter((id) => sectionIds.has(id)),
  };
}

function normalizeTextConcatInputCounts(nodes: ProductionNode[], edges: GraphEdge[]) {
  return nodes.map((node) => {
    if (node.type !== 'textConcat') return node;
    const usedCount = edges.filter((edge) => edge.targetNodeId === node.id && getTextConcatInputPortIndex(edge.targetPortId) >= 0).length;
    const inputCount = Math.max(TEXT_CONCAT_MIN_INPUTS, usedCount + 1);
    const data = node.data as ProductionNodeData & { inputCount?: number };
    if (data.inputCount === inputCount) return node;
    return { ...node, data: { ...node.data, inputCount } };
  });
}

function normalizeTextConcatEdges(edges: GraphEdge[], nodes: ProductionNode[]) {
  const textConcatIds = new Set(nodes.filter((node) => node.type === 'textConcat').map((node) => node.id));
  const nextPortByEdgeId = new Map<string, string>();
  textConcatIds.forEach((nodeId) => {
    edges
      .filter((edge) => edge.targetNodeId === nodeId && getTextConcatInputPortIndex(edge.targetPortId) >= 0)
      .forEach((edge, index) => nextPortByEdgeId.set(edge.id, getTextConcatInputPortId(index)));
  });
  return edges.map((edge) => (
    nextPortByEdgeId.has(edge.id)
      ? { ...edge, targetPortId: nextPortByEdgeId.get(edge.id) ?? edge.targetPortId }
      : edge
  ));
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

  if (node.type === 'textConcat') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        separator: 'double-newline',
        customSeparator: '',
        inputCount: 2,
        prefix: '',
        suffix: '',
        result: '',
        sourceCount: 0,
        ...node.data,
        title: 'Concat',
      },
    } as ProductionNode;
  }

  if (node.type === 'textGeneration') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        model: 'google/gemini-2.5-flash',
        instruction: 'Rewrite the connected text into a concise production-ready image prompt.',
        outputStyle: 'plain',
        reasoning: 'low',
        temperature: 1,
        activeResultIndex: -1,
        result: '',
        resultTexts: [],
        ...node.data,
        title: 'Text Gen',
      },
    } as ProductionNode;
  }

  if (node.type === 'textSplitter') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        mode: 'delimiter',
        delimiter: '*',
        activeItemIndex: 0,
        items: [],
        message: '',
        result: '',
        sourceText: '',
        ...node.data,
        title: 'Splitter',
      },
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

  if (node.type === 'curves') {
    const data = node.data as ProductionNodeData & { curves?: Parameters<typeof normalizeCurves>[0]; opacity?: number };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        activeChannel: 'master',
        ...node.data,
        curves: normalizeCurves(data.curves),
        opacity: typeof data.opacity === 'number' && Number.isFinite(data.opacity) ? Math.min(100, Math.max(0, Math.round(data.opacity))) : 100,
        title: 'Curves',
      },
    } as ProductionNode;
  }

  if (node.type === 'frequencyRetouch') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        radius: 8,
        rednessReduction: 20,
        textureAmount: 100,
        toneSmoothing: 45,
        ...node.data,
        title: 'Retouch',
      },
    } as ProductionNode;
  }

  if (node.type === 'refineImage') {
    const history = getGenerationHistory(node.data as unknown as GenerationHistoryData);
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        model: 'google/gemini-2.5-flash-image',
        mode: 'reference-cleanup',
        preserveStrength: 'strict',
        size: '2K',
        instruction: '',
        ...node.data,
        activeResultIndex: history.activeIndex,
        resultAssetId: history.activeAssetId,
        resultAssetIds: history.assetIds,
        title: 'Refine',
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
  const target = nodes.find((node) => node.id === edge.targetNodeId);
  const shouldRenameImageOutput = (
    (source?.type === 'cropImage' || source?.type === 'curves' || source?.type === 'frequencyRetouch' || source?.type === 'removeBackground')
    && edge.sourcePortId === 'image'
  );
  const sourcePortId = shouldRenameImageOutput
    ? 'result'
    : edge.sourcePortId === 'preset' ? 'result' : edge.sourcePortId;
  const targetPortId = target?.type === 'textConcat' && edge.targetPortId === 'text'
    ? 'text-0'
    : edge.targetPortId === 'reference' ? 'style' : edge.targetPortId;

  return {
    ...edge,
    sourcePortId: source?.type === 'textSplitter' && sourcePortId === 'result' ? 'item-0' : sourcePortId,
    targetPortId,
  };
}
