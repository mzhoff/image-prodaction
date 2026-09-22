'use client';
import { useMemo } from 'react';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { useVideoModels } from '@/features/graph-node/model/use-video-models';
import { getVideoModelDisplayName } from '@/shared/media/video-generation-contracts';
import { transcriptionModelOptions } from '@/features/graph-node/model/audio-node-options';

/** Use the very same product catalog labels as the composer and Canvas pickers. */
export function useUsageModels() {
  const catalog = useOpenRouterModels(), video = useVideoModels();
  return useMemo(() => {
    const names = new Map([...catalog.analysisModels, ...catalog.imageModels, ...(catalog.generationModels ?? []), ...catalog.speechModels].map((item) => [item.id, item.label]));
    for (const item of transcriptionModelOptions('google/gemini-3.1-flash-lite')) if (!names.has(item.value)) names.set(item.value, item.label);
    for (const item of video.models) names.set(item.key, getVideoModelDisplayName(item.key, item.label));
    const videoIds = new Set(video.models.map((item) => item.key));
    return { label: (id: string) => names.get(id) ?? id.split('/').at(-1) ?? id, isVideo: (id: string) => videoIds.has(id) };
  }, [catalog.analysisModels, catalog.imageModels, catalog.generationModels, catalog.speechModels, video.models]);
}
