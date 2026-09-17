import { getPortById } from '@/entities/production-graph/model/node-definitions';
import type { CropImageNodeData, GraphEdge, ProductionNode } from '@/entities/production-graph/model/types';
import { videoCropSchema } from '@/shared/media/video-contracts';
import { cropAspectRatioOptions } from '@/shared/media/crop-geometry';
import type { PipelineValue } from '../../contracts/pipeline-contracts';
import { invalidPipeline, resolveTransparentSource } from './studio-graph-resolution';

export function getVideoCropRuntimeDescriptor(node: ProductionNode, graph: {
  edges: GraphEdge[];
  incomingByNode: ReadonlyMap<string, GraphEdge[]>;
  nodeById: ReadonlyMap<string, ProductionNode>;
}) {
  const inputs = graph.edges.filter((edge) => edge.targetNodeId === node.id);
  if (inputs.some((edge) => edge.targetPortId === 'image')) {
    throw invalidPipeline(inputs.some((edge) => edge.targetPortId === 'video')
      ? 'Crop не может одновременно принимать изображение и видео. Оставьте один источник.'
      : 'Crop изображений пока работает только в Studio. Серверный Crop принимает видео.');
  }
  if (inputs.length !== 1 || inputs[0].targetPortId !== 'video') {
    throw invalidPipeline('Серверный Crop требует ровно один подключённый video-вход.');
  }
  const source = resolveTransparentSource(inputs[0], graph.incomingByNode, graph.nodeById);
  if (!source || getPortById(source.source, source.sourcePortId)?.kind !== 'video') {
    throw invalidPipeline('Вход Crop должен получать видео, а не изображение, текст или URL.');
  }
  const data = node.data as CropImageNodeData;
  if (!cropAspectRatioOptions.includes(data.aspectRatio)) throw invalidPipeline('Выберите доступный формат рамки Crop.');
  const config: Record<string, PipelineValue> = { aspectRatio: data.aspectRatio };
  if (data.crop !== undefined) {
    const crop = videoCropSchema.safeParse(data.crop);
    if (!crop.success) throw invalidPipeline('Перед публикацией выберите корректную рамку Crop внутри видео.');
    config.crop = crop.data;
  }
  return { handlerType: 'video.crop', config };
}
