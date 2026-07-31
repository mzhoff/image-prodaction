import type {
  PipelineNodeHandler,
  PipelineNodeHandlerRegistry,
} from '../contracts/pipeline-contracts';

export function createStaticPipelineHandlerRegistry(
  handlers: PipelineNodeHandler[],
): PipelineNodeHandlerRegistry {
  const byKey = new Map<string, PipelineNodeHandler>();
  for (const handler of handlers) {
    const key = toHandlerKey(handler.handlerType, handler.handlerVersion);
    if (byKey.has(key)) throw new Error(`Duplicate pipeline handler ${key}.`);
    byKey.set(key, handler);
  }
  return {
    resolve(handlerType, handlerVersion) {
      return byKey.get(toHandlerKey(handlerType, handlerVersion)) ?? null;
    },
  };
}

function toHandlerKey(handlerType: string, handlerVersion: string) {
  return `${handlerType}@${handlerVersion}`;
}
