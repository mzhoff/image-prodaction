import type { PipelineNodeHandlerRegistry } from '../contracts/pipeline-contracts';
import {
  createAiPipelineHandlers,
  createOpenRouterTextGenerator,
  type PipelineHandlerScope,
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

export type { PipelineTextGenerator } from './pipeline-ai-handlers';

export function createProductionPipelineHandlerRegistry(
  scope: PipelineHandlerScope,
  dependencies: {
    analyzeImage?: PipelineImageAnalyzer;
    exportImage?: PipelineImageExporter;
    generateImage?: PipelineImageGenerator;
    generateText?: PipelineTextGenerator;
  } = {},
): PipelineNodeHandlerRegistry {
  const handlers = [
    ...createDeterministicTextHandlers(),
    ...createAiPipelineHandlers({
      analyzeImage: dependencies.analyzeImage ?? createOpenRouterImageAnalyzer(scope),
      exportImage: dependencies.exportImage ?? createSharpImageExporter(scope),
      generateImage: dependencies.generateImage ?? createQueuedImageGenerator(scope),
      generateText: dependencies.generateText ?? createOpenRouterTextGenerator(scope),
    }),
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
