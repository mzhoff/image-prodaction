import { createAssetIngestExecutor } from './asset-ingest-executor';
import { createImageGenerationExecutor } from './image-generation-executor';
import { createSpeechGenerationExecutor } from './speech-generation-executor';
import { createTimelineGenerationExecutor } from './timeline-generation-executor';
import { createVideoGenerationExecutor } from './video-generation-executor';
import type { GenerationExecutor } from './generation-worker-contracts';
import { createMontageExecutor } from './montage-executor';

/** The existing durable worker owns both image requests and long speech assembly. */
export function createProductionGenerationExecutor(): GenerationExecutor {
  const ingest = createAssetIngestExecutor();
  const image = createImageGenerationExecutor();
  const speech = createSpeechGenerationExecutor();
  const timeline = createTimelineGenerationExecutor();
  const video = createVideoGenerationExecutor();
  const montage = createMontageExecutor();
  return { execute: (input) => input.job.operation === 'asset_ingest' ? ingest.execute(input) : input.job.operation.startsWith('montage_') ? montage.execute(input)
    : input.job.operation.startsWith('timeline_') ? timeline.execute(input)
    : input.job.operation === 'generate_video' ? video.execute(input)
    : input.job.operation === 'generate_speech_long' ? speech.execute(input) : image.execute(input) };
}
