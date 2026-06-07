import { buildExtractPrompt, defaultExtractPrompt, normalizeExtractPresetSelection } from './extract-presets';
import { getGenerationHistory, type GenerationHistoryData } from './generation-history';
import { initialProject } from './initial-project';
import {
  TELEGRAM_MEDIA_MAX_INPUTS,
  TELEGRAM_MEDIA_MIN_INPUTS,
  TEXT_CONCAT_MIN_INPUTS,
  TEXT_PROMPT_VARIABLE_MAX_INPUTS,
  getTelegramMediaInputPortId,
  getTelegramMediaInputPortIndex,
  getTextConcatInputPortId,
  getTextConcatInputPortIndex,
  getTextPromptVariablePortId,
  getTextPromptVariablePortIndex,
} from './node-definitions';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO, normalizeNodeSize } from './node-layout';
import { productionLayers } from './production-layers';
import { PROJECT_SCHEMA_VERSION } from './project-schema';
import { normalizePublicationArtifacts } from './publication';
import { DEFAULT_PUBLICATION_CONTENT_UNIT_ID } from './publication-platforms';
import { normalizeLocationPreserveStrength, normalizeLocationType } from './location';
import { normalizeSubjectPreserveStrength, normalizeSubjectType } from './subject';
import { normalizeProductionLayerIds } from './layer-text-parser';
import { normalizeSectionHierarchyByGeometry } from './graph-section-layout';
import type { ExtractPresetId, GraphEdge, GraphProject, LocationRecord, ProductionNode, ProductionNodeData, SubjectRecord } from './types';
import { normalizeCurves } from '@/shared/lib/image-renderer/curves';

export function normalizeProject(project: GraphProject): GraphProject {
  const nodes = (project.nodes ?? []).map(normalizeNode).map(normalizeNodeRuntimeStatus);
  const normalizedEdges = (project.edges ?? []).map((edge) => normalizeEdge(edge, nodes));
  const edges = normalizeTelegramMediaEdges(normalizeTextConcatEdges(normalizedEdges, nodes), nodes);
  const nodesWithPortCounts = normalizeTelegramMediaInputCounts(normalizeTextConcatInputCounts(nodes, edges), edges);
  const sections = normalizeSectionHierarchyByGeometry((project.sections ?? []).map((section, index) => normalizeSection(section, index)));
  const sectionIds = new Set(sections.map((section) => section.id));
  const subjects = normalizeSubjectRecords(project.subjects ?? []);
  const locations = normalizeLocationRecords(project.locations ?? []);
  const publications = normalizePublicationArtifacts(project.publications);

  return {
    ...initialProject,
    ...project,
    nodes: nodesWithPortCounts,
    sections,
    edges,
    subjects,
    locations,
    publications,
    version: PROJECT_SCHEMA_VERSION,
    selectedNodeIds: project.selectedNodeIds ?? [],
    selectedSectionIds: (project.selectedSectionIds ?? []).filter((id) => sectionIds.has(id)),
  };
}

function normalizeNodeRuntimeStatus(node: ProductionNode): ProductionNode {
  if (node.status === 'running') return { ...node, status: 'idle' };
  if (node.status === 'idle' || node.status === 'success' || node.status === 'error') return node;
  return { ...node, status: 'idle' };
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

function normalizeTelegramMediaInputCounts(nodes: ProductionNode[], edges: GraphEdge[]) {
  return nodes.map((node) => {
    if (node.type !== 'telegramPublication') return node;
    const usedCount = edges.filter((edge) => edge.targetNodeId === node.id && getTelegramMediaInputPortIndex(edge.targetPortId) >= 0).length;
    const inputCount = Math.max(
      TELEGRAM_MEDIA_MIN_INPUTS,
      Math.min(TELEGRAM_MEDIA_MAX_INPUTS, usedCount + 1),
    );
    const data = node.data as ProductionNodeData & { mediaInputCount?: number };
    if (data.mediaInputCount === inputCount) return node;
    return { ...node, data: { ...node.data, mediaInputCount: inputCount } };
  });
}

function normalizeTextConcatEdges(edges: GraphEdge[], nodes: ProductionNode[]) {
  const textConcatIds = new Set(nodes.filter((node) => node.type === 'textConcat').map((node) => node.id));
  const nextPortByEdgeId = new Map<string, string>();
  textConcatIds.forEach((nodeId) => {
    edges
      .filter((edge) => edge.targetNodeId === nodeId && getTextConcatInputPortIndex(edge.targetPortId) >= 0)
      .sort((first, second) => getTextConcatInputPortIndex(first.targetPortId) - getTextConcatInputPortIndex(second.targetPortId))
      .forEach((edge, index) => nextPortByEdgeId.set(edge.id, getTextConcatInputPortId(index)));
  });
  return edges.map((edge) => (
    nextPortByEdgeId.has(edge.id)
      ? { ...edge, targetPortId: nextPortByEdgeId.get(edge.id) ?? edge.targetPortId }
      : edge
  ));
}

function normalizeTelegramMediaEdges(edges: GraphEdge[], nodes: ProductionNode[]) {
  const telegramPublicationIds = new Set(nodes.filter((node) => node.type === 'telegramPublication').map((node) => node.id));
  const nextPortByEdgeId = new Map<string, string>();
  telegramPublicationIds.forEach((nodeId) => {
    edges
      .filter((edge) => edge.targetNodeId === nodeId && getTelegramMediaInputPortIndex(edge.targetPortId) >= 0)
      .sort((first, second) => getTelegramMediaInputPortIndex(first.targetPortId) - getTelegramMediaInputPortIndex(second.targetPortId))
      .forEach((edge, index) => nextPortByEdgeId.set(edge.id, getTelegramMediaInputPortId(index)));
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
    parentId: typeof section.parentId === 'string' ? section.parentId : undefined,
    position: section.position ?? { x: 0, y: 0 },
    size: section.size ?? { width: 640, height: 420 },
    color: normalizeSectionColor(section.color),
    locked: section.locked === true,
  };
}

function normalizeSectionColor(color: unknown) {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined;
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
      data: {
        model: 'google/gemini-2.5-flash',
        ...nextData,
        disabledLayerIds: normalizeProductionLayerIds(nextData.disabledLayerIds),
        preset: presets[0],
        presets,
        prompt,
        title: 'Extract',
      },
    } as ProductionNode;
  }

  if (node.type === 'textPrompt') {
    const data = node.data as ProductionNodeData & { textareaHeight?: unknown; variableDisplayMode?: unknown; variables?: unknown };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        result: '',
        sourceCount: 0,
        text: '',
        ...data,
        textareaHeight: normalizeTextPromptTextareaHeight(data.textareaHeight),
        title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Prompt',
        variableDisplayMode: normalizeTextPromptVariableDisplayMode(data.variableDisplayMode),
        variables: normalizeTextPromptVariables(data.variables),
      },
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
        disabledResultFilterIds: [],
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

  if (node.type === 'iterator') {
    const data = node.data as ProductionNodeData & {
      activeIndex?: unknown;
      activeKind?: unknown;
      imageCount?: unknown;
      textCount?: unknown;
    };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        ...data,
        activeImageAssetId: '',
        activeIndex: typeof data.activeIndex === 'number' && Number.isFinite(data.activeIndex) ? Math.max(0, Math.floor(data.activeIndex)) : 0,
        activeKind: data.activeKind === 'text' ? 'text' : 'image',
        activeText: '',
        imageCount: typeof data.imageCount === 'number' && Number.isFinite(data.imageCount) ? Math.max(0, Math.floor(data.imageCount)) : 0,
        message: '',
        textCount: typeof data.textCount === 'number' && Number.isFinite(data.textCount) ? Math.max(0, Math.floor(data.textCount)) : 0,
        title: 'Iterator',
      },
    } as ProductionNode;
  }

  if (node.type === 'subjectBuilder') {
    const data = node.data as ProductionNodeData & {
      libraryImageAssetIds?: unknown;
      librarySubjectId?: unknown;
      libraryUpdatedAt?: unknown;
      preserveStrength?: unknown;
      referenceModel?: unknown;
      subjectType?: unknown;
    };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        name: '',
        identitySummary: '',
        immutableTraits: '',
        mutableAttributes: '',
        negativeConstraints: '',
        notes: '',
        result: '',
        sourceCount: 0,
        ...data,
        libraryImageAssetIds: normalizeStringArray(data.libraryImageAssetIds),
        librarySubjectId: typeof data.librarySubjectId === 'string' ? data.librarySubjectId : undefined,
        libraryUpdatedAt: typeof data.libraryUpdatedAt === 'string' ? data.libraryUpdatedAt : undefined,
        preserveStrength: normalizeSubjectPreserveStrength(data.preserveStrength),
        referenceModel: typeof data.referenceModel === 'string' ? data.referenceModel : 'google/gemini-2.5-flash-image',
        subjectType: normalizeSubjectType(data.subjectType),
        title: 'Subject',
      },
    } as ProductionNode;
  }

  if (node.type === 'locationBuilder') {
    const data = node.data as ProductionNodeData & {
      libraryImageAssetIds?: unknown;
      libraryLocationId?: unknown;
      libraryUpdatedAt?: unknown;
      locationType?: unknown;
      preserveStrength?: unknown;
    };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        atmosphere: '',
        description: '',
        mutableAttributes: '',
        name: '',
        negativeConstraints: '',
        notes: '',
        result: '',
        sourceCount: 0,
        spatialLayout: '',
        ...data,
        libraryImageAssetIds: normalizeStringArray(data.libraryImageAssetIds),
        libraryLocationId: typeof data.libraryLocationId === 'string' ? data.libraryLocationId : undefined,
        libraryUpdatedAt: typeof data.libraryUpdatedAt === 'string' ? data.libraryUpdatedAt : undefined,
        locationType: normalizeLocationType(data.locationType),
        preserveStrength: normalizeLocationPreserveStrength(data.preserveStrength),
        title: 'Location',
      },
    } as ProductionNode;
  }

  if (node.type === 'telegramPublication') {
    const data = node.data as ProductionNodeData & {
      contentUnitId?: unknown;
      mediaInputCount?: unknown;
      mediaOrder?: unknown;
      messageRichText?: unknown;
      messageRichTextSource?: unknown;
      messageSourceText?: unknown;
      messageText?: unknown;
      platformId?: unknown;
      sourceImageCount?: unknown;
      sourceTextCount?: unknown;
    };
    const legacyMessageText = getLegacyTelegramMessageText(data as unknown as Record<string, unknown>);
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        artifactId: '',
        result: '',
        ...data,
        contentUnitId: data.contentUnitId === DEFAULT_PUBLICATION_CONTENT_UNIT_ID
          ? data.contentUnitId
          : DEFAULT_PUBLICATION_CONTENT_UNIT_ID,
        mediaInputCount: typeof data.mediaInputCount === 'number' && Number.isFinite(data.mediaInputCount)
          ? Math.max(1, Math.min(10, Math.floor(data.mediaInputCount)))
          : 1,
        mediaOrder: normalizeStringArray(data.mediaOrder),
        messageRichText: typeof data.messageRichText === 'string' ? data.messageRichText : '',
        messageRichTextSource: typeof data.messageRichTextSource === 'string' ? data.messageRichTextSource : '',
        messageSourceText: typeof data.messageSourceText === 'string' ? data.messageSourceText : '',
        messageText: typeof data.messageText === 'string' ? data.messageText : legacyMessageText,
        platformId: data.platformId === 'telegram' ? data.platformId : 'telegram',
        sourceImageCount: typeof data.sourceImageCount === 'number' && Number.isFinite(data.sourceImageCount)
          ? Math.max(0, Math.floor(data.sourceImageCount))
          : 0,
        sourceTextCount: typeof data.sourceTextCount === 'number' && Number.isFinite(data.sourceTextCount)
          ? Math.max(0, Math.floor(data.sourceTextCount))
          : 0,
        title: 'Telegram Post',
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

function normalizeSubjectRecords(subjects: SubjectRecord[]) {
  return subjects
    .filter((subject): subject is SubjectRecord => Boolean(subject?.id))
    .map((subject) => ({
      id: subject.id,
      createdAt: typeof subject.createdAt === 'string' ? subject.createdAt : new Date().toISOString(),
      identitySummary: subject.identitySummary ?? '',
      imageAssetIds: normalizeStringArray(subject.imageAssetIds),
      immutableTraits: subject.immutableTraits ?? '',
      mutableAttributes: subject.mutableAttributes ?? '',
      name: subject.name ?? '',
      negativeConstraints: subject.negativeConstraints ?? '',
      notes: subject.notes ?? '',
      passportText: subject.passportText ?? '',
      preserveStrength: normalizeSubjectPreserveStrength(subject.preserveStrength),
      sourceNodeId: typeof subject.sourceNodeId === 'string' ? subject.sourceNodeId : undefined,
      subjectType: normalizeSubjectType(subject.subjectType),
      title: subject.title || subject.name || 'Untitled subject',
      updatedAt: typeof subject.updatedAt === 'string' ? subject.updatedAt : new Date().toISOString(),
    }));
}

function normalizeLocationRecords(locations: LocationRecord[]) {
  return locations
    .filter((location): location is LocationRecord => Boolean(location?.id))
    .map((location) => ({
      id: location.id,
      atmosphere: location.atmosphere ?? '',
      createdAt: typeof location.createdAt === 'string' ? location.createdAt : new Date().toISOString(),
      description: location.description ?? '',
      imageAssetIds: normalizeStringArray(location.imageAssetIds),
      locationType: normalizeLocationType(location.locationType),
      mutableAttributes: location.mutableAttributes ?? '',
      name: location.name ?? '',
      negativeConstraints: location.negativeConstraints ?? '',
      notes: location.notes ?? '',
      passportText: location.passportText ?? '',
      preserveStrength: normalizeLocationPreserveStrength(location.preserveStrength),
      sourceNodeId: typeof location.sourceNodeId === 'string' ? location.sourceNodeId : undefined,
      spatialLayout: location.spatialLayout ?? '',
      title: location.title || location.name || 'Untitled location',
      updatedAt: typeof location.updatedAt === 'string' ? location.updatedAt : new Date().toISOString(),
    }));
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeTextPromptVariables(value: unknown) {
  if (!Array.isArray(value)) return [];
  const usedPortIds = new Set<string>();
  return value.slice(0, TEXT_PROMPT_VARIABLE_MAX_INPUTS).map((item, index) => {
    const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const rawPortId = typeof candidate.id === 'string' ? candidate.id : '';
    const fallbackPortId = getTextPromptVariablePortId(index);
    const portId = getTextPromptVariablePortIndex(rawPortId) >= 0 && !usedPortIds.has(rawPortId)
      ? rawPortId
      : fallbackPortId;
    usedPortIds.add(portId);
    const alias = typeof candidate.alias === 'string' && candidate.alias.trim()
      ? candidate.alias.trim()
      : `Variable ${getTextPromptVariablePortIndex(portId) + 1}`;
    return { id: portId, alias };
  });
}

function normalizeTextPromptVariableDisplayMode(value: unknown) {
  return value === 'source' || value === 'value' || value === 'source-value' ? value : 'source-value';
}

function normalizeTextPromptTextareaHeight(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 248;
  return Math.min(Math.max(Math.round(value), 64), 560);
}

function getLegacyTelegramMessageText(data: Record<string, unknown>) {
  return ['publicationTitle', 'body', 'caption', 'cta']
    .map((key) => (typeof data[key] === 'string' ? data[key].trim() : ''))
    .filter(Boolean)
    .join('\n\n');
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
    : target?.type === 'telegramPublication' && edge.targetPortId === 'media'
    ? getTelegramMediaInputPortId(0)
    : target?.type === 'generateImage' && edge.targetPortId === 'subject' ? 'actors'
    : edge.targetPortId === 'reference' ? 'style' : edge.targetPortId;

  return {
    ...edge,
    sourcePortId: source?.type === 'textSplitter' && sourcePortId === 'result' ? 'item-0' : sourcePortId,
    targetPortId,
  };
}
