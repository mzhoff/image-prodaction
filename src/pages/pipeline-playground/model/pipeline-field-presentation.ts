import type { PipelineJsonSchema, PipelineValueKind } from '@/modules/executable-pipelines/contracts/pipeline-contracts';
export const PIPELINE_KIND_LABELS: Record<PipelineValueKind, string> = {
  image: 'Изображение', image_collection: 'Изображения', video: 'Видео', audio: 'Аудио', text: 'Текст',
  text_collection: 'Список текстов', number: 'Число', boolean: 'Переключатель', json: 'Данные JSON', publication: 'Публикация',
};
export function pipelineSchemaExample(schema?: PipelineJsonSchema, depth = 0, fallback = 'Ваш текст'): unknown {
  if (!schema || depth > 8) return {};
  if (schema.type === 'object') return Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, pipelineSchemaExample(value, depth + 1, fallback)]));
  if (schema.type === 'array') return [pipelineSchemaExample(schema.items, depth + 1, fallback)];
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === 'number' || schema.type === 'integer') return schema.minimum ?? 0;
  if (schema.type === 'boolean') return false;
  return schema.description ?? schema.title ?? fallback;
}
