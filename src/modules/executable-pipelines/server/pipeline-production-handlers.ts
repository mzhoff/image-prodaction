import type { PipelineNodeHandlerRegistry } from '../contracts/pipeline-contracts';
import { createAudioPipelineHandlers, type AudioHandlerDependencies } from './pipeline-audio-handlers';
import { createStoredAudioOperations } from './pipeline-audio-operations';
import { createVideoPipelineHandlers, type VideoHandlerDependencies } from './pipeline-video-handlers';
import { createStoredVideoOperations } from './pipeline-video-operations';
import { createTimelineHandoffHandler } from './pipeline-timeline-handler';
import { createStoriesHandler } from './pipeline-stories-handler';
import { createVideoGenerationHandler } from './pipeline-video-generation-handler';
import type { TimelineAssetReader } from './pipeline-timeline-assets';
import {
  createAiPipelineHandlers,
  createOpenRouterTextGenerator,
  createOpenRouterStructuredGenerator,
  type PipelineHandlerScope,
  type PipelineStructuredGenerator,
  type PipelineTextGenerator,
} from './pipeline-ai-handlers';
import { createDeterministicTextHandlers } from './pipeline-text-handlers';
import {
  createOpenRouterImageAnalyzer,
  createQueuedImageGenerator,
  createSharpImageExporter,
  type PipelineImageAnalyzer,
  type PipelineImageExporter,
  type PipelineImageGenerator,
} from './pipeline-image-operations';
import {
  createQrCodePipelineHandler,
  createStoredQrCodeGenerator,
  type PipelineQrCodeGenerator,
} from './pipeline-qr-code';

export type { PipelineStructuredGenerator, PipelineTextGenerator } from './pipeline-ai-handlers';

export function createProductionPipelineHandlerRegistry(
  scope: PipelineHandlerScope,
  dependencies: {
    audio?: Partial<AudioHandlerDependencies>;
    video?: Partial<VideoHandlerDependencies>;
    readTimelineAssets?: TimelineAssetReader;
    analyzeImage?: PipelineImageAnalyzer;
    exportImage?: PipelineImageExporter;
    generateImage?: PipelineImageGenerator;
    generateQrCode?: PipelineQrCodeGenerator;
    generateStructured?: PipelineStructuredGenerator;
    generateText?: PipelineTextGenerator;
  } = {},
): PipelineNodeHandlerRegistry {
  const handlers = [
    createStoriesHandler(),
    createVideoGenerationHandler(scope),
    createTimelineHandoffHandler(dependencies.readTimelineAssets),
    ...createAudioPipelineHandlers({ ...createStoredAudioOperations(scope), ...dependencies.audio }),
    ...createVideoPipelineHandlers({ ...createStoredVideoOperations(scope), ...dependencies.video }),
    ...createDeterministicTextHandlers(),
    ...createAiPipelineHandlers({
      analyzeImage: dependencies.analyzeImage ?? createOpenRouterImageAnalyzer(scope),
      exportImage: dependencies.exportImage ?? createSharpImageExporter(scope),
      generateImage: dependencies.generateImage ?? createQueuedImageGenerator(scope),
      generateStructured: dependencies.generateStructured ?? createOpenRouterStructuredGenerator(scope),
      generateText: dependencies.generateText ?? createOpenRouterTextGenerator(scope),
    }),
    createQrCodePipelineHandler(
      dependencies.generateQrCode ?? createStoredQrCodeGenerator(scope),
    ),
  ];
  const byKey = new Map(handlers.map((handler) => [
    `${handler.handlerType}@${handler.handlerVersion}`,
    handler,
  ]));
  return {
    resolve(handlerType, handlerVersion) {
      return byKey.get(`${handlerType}@${handlerVersion}`) ?? null;
    },
  };
}
