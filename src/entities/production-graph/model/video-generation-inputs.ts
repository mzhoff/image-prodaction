import { getIncomingImageInputs, getIncomingImageCollectionInputs, getIncomingSources, getIncomingTextInputs } from './graph-io';
import type { GraphIoContext } from '@/entities/production-graph/model/graph-io';
import type { GenerateVideoNodeData } from '@/entities/production-graph/model/types';
import { expandVideoReferenceInputs } from '@/shared/media/video-reference-inputs';
import { videoSettingsSchema, VIDEO_REFERENCE_LIMIT, type VideoGenerationRequest } from '@/shared/media/video-generation-contracts';

/** Studio draft: local image IDs are materialized before the durable request is submitted. */
export function collectVideoRequest(nodeId: string, data: GenerateVideoNodeData, context: GraphIoContext): VideoGenerationRequest {
  const image = (port: string) => {
    const connected = getIncomingSources(nodeId, port, context);
    if (connected.length > 1) throw new Error(`На вход ${port} подключите только одно изображение.`);
    const timelineFrames = getIncomingImageCollectionInputs(nodeId, port, context).filter((entry) => entry.sourceNode.type === 'timelineHandoff');
    if (timelineFrames.length > 1 || timelineFrames.some((entry) => (entry.sourceCollectionSize ?? 0) > 1)) throw new Error('Для нескольких кадров используйте режим References и подключите галерею к reference-1.');
    const resolved = getIncomingImageInputs(nodeId, port, context);
    if (connected.length && (resolved.length !== 1 || resolved[0].asset.kind !== 'image')) {
      throw new Error(`Изображение ${port} ещё не готово. Дождитесь обработки в подключённой ноде.`);
    }
    return resolved[0] ? { assetId: resolved[0].assetId, description: '' } : undefined;
  };
  const promptSources = getIncomingSources(nodeId, 'prompt', context);
  const text = getIncomingTextInputs(nodeId, 'prompt', context);
  if (promptSources.length && !text.length) throw new Error('Подключённый текст ещё не готов.');
  const referenceInputs: Array<{ slot: number; assetIds: string[] }> = [];
  if (data.mode === 'references') {
    for (let slot = 1; slot <= VIDEO_REFERENCE_LIMIT; slot++) {
      const port = `reference-${slot}`;
      const connected = getIncomingSources(nodeId, port, context);
      if (connected.length > 1) throw new Error(`На вход ${port} подключите один источник или одну галерею кадров.`);
      if (!connected.length) continue;
      const gallery = getIncomingImageCollectionInputs(nodeId, port, context);
      const isTimelineGallery = gallery.some((entry) => entry.sourceNode.type === 'timelineHandoff');
      if (isTimelineGallery) {
        if (gallery.length !== gallery[0]?.sourceCollectionSize || gallery.some((entry) => entry.asset.kind !== 'image')) {
          throw new Error('Кадры ещё не готовы. Дождитесь подготовки изображений.');
        }
        referenceInputs.push({ slot, assetIds: gallery.map((entry) => entry.assetId) });
      } else {
        const value = image(port);
        if (value) referenceInputs.push({ slot, assetIds: [value.assetId] });
      }
    }
  }
  const references = expandVideoReferenceInputs(referenceInputs, data.referenceDescriptions);
  return { ...videoSettingsSchema.parse(data), prompt: [...text.map((item) => item.text), data.prompt].filter(Boolean).join('\n\n'),
    firstFrame: data.mode === 'frames' ? image('first-frame') : undefined,
    lastFrame: data.mode === 'frames' ? image('last-frame') : undefined,
    references };
}
