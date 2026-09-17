import { z } from 'zod';
import { imageGenerationOptionsSchema, pickImageGenerationOptions, type ImageGenerationOptions } from '@/shared/media/image-generation-settings';

const descriptor = z.discriminatedUnion('type', [
  z.object({ type: z.literal('enum'), values: z.array(z.string()).max(100) }),
  z.object({ type: z.literal('range'), min: z.number().finite(), max: z.number().finite() }),
  z.object({ type: z.literal('boolean') }),
]);
export const imageParametersSchema = z.record(z.string(), descriptor);
export type ImageParameters = z.infer<typeof imageParametersSchema>;

export interface ImageModelCapabilities {
  parameters: ImageParameters;
  minReferences: number;
  maxReferences: number;
}

export function imageEnum(parameters: ImageParameters, key: string): string[] {
  const value = parameters[key];
  return value?.type === 'enum' ? value.values : [];
}

export function imageCapabilities(parameters: ImageParameters): ImageModelCapabilities {
  const references = parameters.input_references;
  return {
    parameters,
    minReferences: references?.type === 'range' ? Math.max(0, references.min) : 0,
    maxReferences: references?.type === 'range' ? Math.min(4, references.max) : 0,
  };
}

const rawModelSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i),
  name: z.string().min(1),
  architecture: z.object({ input_modalities: z.array(z.string()), output_modalities: z.array(z.string()) }),
  supported_parameters: imageParametersSchema,
});

export function normalizeImageCatalog(raw: unknown) {
  const { data } = z.object({ data: z.array(z.unknown()) }).parse(raw);
  const seen = new Set<string>();
  return data.flatMap((entry) => {
    const model = rawModelSchema.safeParse(entry).data;
    if (!model || seen.has(model.id) || !model.architecture.input_modalities.includes('text')
      || !model.architecture.output_modalities.includes('image')) return [];
    const parameters = model.supported_parameters;
    const formats = imageEnum(parameters, 'output_format');
    if (formats.length && !formats.some((format) => ['png', 'jpeg', 'webp'].includes(format))) return [];
    const capabilities = imageCapabilities(parameters);
    if (capabilities.minReferences > capabilities.maxReferences) return [];
    const count = parameters.n;
    if (count?.type === 'range' && (count.min > 1 || count.max < 1)) return [];
    seen.add(model.id);
    return [{
      id: model.id, name: model.name, label: model.name.replace(/^[^:]+:\s*/, ''),
      inputModalities: model.architecture.input_modalities,
      outputModalities: model.architecture.output_modalities,
      supportedParameters: Object.keys(parameters), imageCapabilities: capabilities,
      aspectRatios: imageEnum(parameters, 'aspect_ratio').length ? imageEnum(parameters, 'aspect_ratio') : ['auto'],
      sizes: imageEnum(parameters, 'resolution').length ? imageEnum(parameters, 'resolution') : ['auto'],
    }];
  });
}

export function validateImageSettings(
  settings: ImageGenerationOptions & { aspectRatio: string; size: string },
  referenceCount: number,
  capabilities: ImageModelCapabilities,
): string | undefined {
  const parsed = imageGenerationOptionsSchemaForValidation(settings);
  if (!parsed) return 'Некорректные настройки генерации изображения.';
  const parameters = capabilities.parameters;
  const count = parameters.n;
  if (count?.type === 'range' && (count.min > 1 || count.max < 1)) return 'Модель не поддерживает один результат за запуск.';
  const fields = [
    ['aspect_ratio', settings.aspectRatio], ['resolution', settings.size],
    ['quality', settings.imageQuality], ['background', settings.imageBackground],
    ['output_format', settings.imageFormat],
  ] as const;
  for (const [field, value] of fields) {
    if (value === undefined) continue;
    if (!parameters[field] && value === 'auto' && (field === 'aspect_ratio' || field === 'resolution')) continue;
    if (!imageEnum(parameters, field).includes(value)) return `Параметр ${field}=${value} недоступен для выбранной модели OpenRouter.`;
  }
  if (referenceCount < capabilities.minReferences || referenceCount > capabilities.maxReferences) {
    return `Для этой модели нужно от ${capabilities.minReferences} до ${capabilities.maxReferences} изображений-референсов. Подключено: ${referenceCount}.`;
  }
  if (settings.imageSeed !== undefined && parameters.seed?.type !== 'boolean') return 'Эта модель не поддерживает seed.';
  if (settings.imageCompression !== undefined) {
    const range = parameters.output_compression;
    if (range?.type !== 'range' || settings.imageCompression < range.min || settings.imageCompression > range.max) return 'Сжатие недоступно для выбранной модели.';
    if (!settings.imageFormat || !['jpeg', 'webp'].includes(settings.imageFormat)) return 'Сжатие применяется только к JPEG и WebP.';
  }
  const formats = imageEnum(parameters, 'output_format');
  if (settings.imageBackground === 'transparent' && (settings.imageFormat === 'jpeg'
    || (!settings.imageFormat && formats.length === 1 && formats[0] === 'jpeg'))) return 'Для прозрачного фона выберите PNG или WebP.';
}

// Keep runtime inputs bounded even when they originate in an imported graph.
function imageGenerationOptionsSchemaForValidation(settings: ImageGenerationOptions) {
  return imageGenerationOptionsSchema.safeParse(pickImageGenerationOptions(settings)).success;
}
