import { buildExtractPrompt, normalizeExtractPresetSelection } from './extract-presets';
import { normalizeExtractLayerIds } from './extract-layer-parser';
import { extractAnalysisPresets, getExtractLayers, normalizeExtractAnalysisPreset } from './extract-analysis-profiles';
import { normalizeNodeSize } from './node-layout';
import { productionLayers } from './production-layers';
import type { ExtractPresetId, ImageToTextNodeData, ProductionNode, ProductionNodeData } from './types';

export function normalizeExtractNode(node: ProductionNode): ProductionNode {
  const data = node.data as ProductionNodeData;
  const { mode: _mode, aspectRatio: _aspectRatio, size: _size, ...nextData } = data as unknown as Record<string, unknown>;
  const analysisPreset = normalizeExtractAnalysisPreset(nextData.analysisPreset);
  const legacyPreset = nextData.preset === 'default' || (typeof nextData.preset === 'string' && getExtractLayers(analysisPreset).some((layer) => layer.id === nextData.preset))
    ? nextData.preset as ExtractPresetId
    : 'default';
  const rawPresets = Array.isArray(nextData.presets)
    ? nextData.presets.filter((preset): preset is ExtractPresetId => typeof preset === 'string')
    : legacyPreset;
  const presets = normalizeExtractPresetSelection(rawPresets, analysisPreset);
  const nextPrompt = buildExtractPrompt(presets, analysisPreset).systemPrompt;
  const storedPrompt = typeof nextData.prompt === 'string' ? nextData.prompt : '';
  const prompt = storedPrompt.trim().length > 0 && !(analysisPreset === 'composition' && isLegacyExtractPrompt(storedPrompt, legacyPreset))
    ? storedPrompt
    : nextPrompt;
  return {
    ...node,
    size: normalizeNodeSize(node.type, node.size),
    data: {
      model: 'google/gemini-2.5-flash',
      ...nextData,
      analysisPreset,
      analysisPresetDrafts: normalizeExtractDrafts(nextData.analysisPresetDrafts),
      disabledLayerIds: normalizeExtractLayerIds(nextData.disabledLayerIds),
      preset: presets[0],
      presets,
      prompt,
      title: 'Extract',
    },
  } as ProductionNode;
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

function normalizeExtractDrafts(input: unknown): ImageToTextNodeData['analysisPresetDrafts'] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const drafts: NonNullable<ImageToTextNodeData['analysisPresetDrafts']> = {};
  for (const profile of extractAnalysisPresets) {
    const value = (input as Record<string, unknown>)[profile.id];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    if (typeof entry.prompt !== 'string') continue;
    drafts[profile.id] = {
      presets: normalizeExtractPresetSelection(Array.isArray(entry.presets) ? entry.presets as ExtractPresetId[] : undefined, profile.id),
      prompt: entry.prompt,
    };
  }
  return drafts;
}
