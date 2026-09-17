import type { ImportImageNodeData, ProductionNodeData } from './types';

export function normalizeImportNodeData(value: ProductionNodeData): ImportImageNodeData {
  const { prompt: _prompt, ...data } = value as unknown as Record<string, unknown>;
  for (const field of ['videoAudioTrackIndex', 'videoDerivedAudioTrackIndex', 'videoPreviewAudioTrackIndex']) {
    const index = data[field];
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 31) delete data[field];
  }
  return {
    title: 'Import', ...data,
    mediaKind: data.mediaKind === 'audio' || data.mediaKind === 'video' ? data.mediaKind : 'image',
  } as ImportImageNodeData;
}
