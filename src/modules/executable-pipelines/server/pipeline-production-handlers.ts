import type { PipelineNodeHandlerRegistry } from '../contracts/pipeline-contracts';
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
    analyzeImage?: PipelineImageAnalyzer;
    exportImage?: PipelineImageExporter;
    generateImage?: PipelineImageGenerator;
    generateQrCode?: PipelineQrCodeGenerator;
    generateStructured?: PipelineStructuredGenerator;
    generateText?: PipelineTextGenerator;
  } = {},
): PipelineNodeHandlerRegistry {
  const handlers = [
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
