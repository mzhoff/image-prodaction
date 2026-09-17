import { normalizeExtractAnalysisPreset } from './extract-analysis-profiles';
import { buildExtractPrompt, normalizeExtractPresetSelection } from './extract-presets';
import type { ImageToTextNodeData } from './types';

/** Save the current prompt before entering another analysis framework. Results stay unchanged. */
export function getExtractAnalysisPresetPatch(data: ImageToTextNodeData, value: string) {
  const currentPreset = normalizeExtractAnalysisPreset(data.analysisPreset);
  const nextPreset = normalizeExtractAnalysisPreset(value);
  if (currentPreset === nextPreset) return null;

  const currentLayers = normalizeExtractPresetSelection(data.presets ?? data.preset, currentPreset);
  const savedDraft = data.analysisPresetDrafts?.[nextPreset];
  const nextLayers = normalizeExtractPresetSelection(savedDraft?.presets, nextPreset);
  const nextPrompt = savedDraft?.prompt ?? buildExtractPrompt(nextLayers, nextPreset).systemPrompt;

  return {
    analysisPreset: nextPreset,
    analysisPresetDrafts: {
      ...data.analysisPresetDrafts,
      [currentPreset]: {
        presets: currentLayers,
        prompt: data.prompt ?? buildExtractPrompt(currentLayers, currentPreset).systemPrompt,
      },
      [nextPreset]: { presets: nextLayers, prompt: nextPrompt },
    },
    preset: nextLayers[0],
    presets: nextLayers,
    prompt: nextPrompt,
  } satisfies Partial<ImageToTextNodeData>;
}
