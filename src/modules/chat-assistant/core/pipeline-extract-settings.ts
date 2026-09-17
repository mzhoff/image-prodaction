import type { ImageToTextNodeData, ExtractPresetId } from '@/entities/production-graph/model/types';
import { getExtractLayers, normalizeExtractAnalysisPreset } from '@/entities/production-graph/model/extract-analysis-profiles';
import { getExtractAnalysisPresetPatch } from '@/entities/production-graph/model/extract-analysis-preset-state';
import { buildExtractPrompt } from '@/entities/production-graph/model/extract-presets';

/** Tool edits use Studio's profile drafts and layer constructor, without executing analysis. */
export function mergeExtractNodeSettings(
  previous: ImageToTextNodeData,
  settings: Record<string, unknown>,
): ImageToTextNodeData {
  const profile = normalizeExtractAnalysisPreset(settings.analysisPreset ?? previous.analysisPreset);
  const profilePatch = getExtractAnalysisPresetPatch(previous, profile);
  const data = { ...previous, ...profilePatch, ...settings, analysisPreset: profile } as ImageToTextNodeData;
  const explicitSelection = settings.presets ?? settings.preset;
  if (explicitSelection !== undefined) {
    const allowed = new Set<string>(['default', ...getExtractLayers(profile).map((layer) => layer.id)]);
    const requested = Array.isArray(explicitSelection) ? explicitSelection : [explicitSelection];
    if (requested.some((layer) => typeof layer !== 'string' || !allowed.has(layer))) {
      throw new Error(`Layers do not belong to Extract preset ${profile}. Choose layers from this profile or default. No settings were applied.`);
    }
    const generated = buildExtractPrompt(explicitSelection as ExtractPresetId[] | ExtractPresetId, profile);
    data.presets = generated.presetIds;
    data.preset = generated.presetIds[0];
    if (!Object.hasOwn(settings, 'prompt')) data.prompt = generated.systemPrompt;
  }
  return data;
}
