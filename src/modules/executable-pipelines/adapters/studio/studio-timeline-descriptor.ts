import type { ProductionNode, TimelineHandoffNodeData } from '@/entities/production-graph/model/types';
import { getTimelineOutputShots, timelineClipSignature, timelineOutputFrameAssetIds } from '@/shared/media/timeline-output';
import { timelineAnalysisSchema } from '@/shared/media/timeline-contracts';
import type { PipelineValue } from '../../contracts/pipeline-contracts';
import { invalidPipeline } from './studio-graph-resolution';

export function getTimelineRuntimeDescriptor(node: ProductionNode, outputPortIds: string[] = []) {
  const data = node.data as TimelineHandoffNodeData;
  const parsed = timelineAnalysisSchema.safeParse(data.analysis);
  if (!parsed.success) throw invalidPipeline('Timeline Handoff: сначала выполните Analyze video и проверьте раскадровку в Studio.');
  if (data.request || node.status === 'running') throw invalidPipeline('Timeline Handoff: дождитесь завершения текущей задачи перед публикацией.');
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength > 1_000_000) throw invalidPipeline('Timeline Handoff snapshot exceeds the 1 MB configuration limit.');
  const config: Record<string, PipelineValue> = { analysis: parsed.data as unknown as PipelineValue };
  const outputPorts = [...new Set(outputPortIds.filter((id) => ['frames', 'descriptions', 'videoResult'].includes(id)))];
  if (outputPorts.length) {
    const outputScope = data.outputScope === 'all' ? 'all' : 'selected';
    const shots = getTimelineOutputShots(parsed.data, outputScope, data.activeShotIndex);
    config.outputPorts = outputPorts;
    config.outputScope = outputScope;
    if (outputScope === 'selected') config.activeShotIndex = parsed.data.shots.indexOf(shots[0]!);
    if (outputPorts.includes('frames') && !timelineOutputFrameAssetIds(shots).length) {
      throw invalidPipeline('Timeline Handoff: дождитесь подготовки всех выбранных стоп-кадров перед публикацией Frames.');
    }
    if (outputPorts.includes('videoResult') && outputScope === 'selected') {
      if (!data.videoResultAssetId || data.videoResultSignature !== timelineClipSignature(parsed.data, shots[0]!)) {
        throw invalidPipeline('Timeline Handoff: сначала подготовьте видео выбранного фрагмента перед публикацией.');
      }
      config.clipAssetId = data.videoResultAssetId;
    }
  }
  return { handlerType: 'timeline.handoff', config };
}
