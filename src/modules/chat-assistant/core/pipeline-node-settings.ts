import { extractLayerDefinitions } from '@/entities/production-graph/model/extract-analysis-profiles';
import { z } from 'zod';
import type {
  CropRect,
  PipelineContractField,
  ProductionNodeType,
  TextPromptVariable,
} from '@/entities/production-graph/model/types';
import { QR_CODE_LIMITS } from '@/shared/qr-code';
import { cropAspectRatioOptions } from '@/shared/media/crop-geometry';
import { audioConvertOptionsSchema } from '@/shared/media/audio-contracts';
import { imageGenerationOptionsSchema } from '@/shared/media/image-generation-settings';
import { isTimelineModel } from '@/shared/api/timeline-models';
import { STORY_CONTENT_LIMITS_V1, countStoryTextCharacters } from '@prodaction/stories-platform-contracts/limits/1.0.0';
import {
  PIPELINE_NODE_CONFIGURABLE_FIELDS,
  type PipelineNodeSetting,
} from '../contracts/image-production-tools';
import { pipelineContractFieldsSchema } from './pipeline-contract-field-schema';

const shortTextSchema = z.string().trim().min(1).max(120);
const longTextSchema = z.string().trim().max(4_000);
const textPromptVariablesSchema = z.array(z.object({
  alias: z.string().trim().min(1).max(48),
  id: z.string().regex(/^variable-[0-9]$/),
}).strict()).max(10).refine((variables) => (
  new Set(variables.map((variable) => variable.alias.toLocaleLowerCase('ru-RU'))).size === variables.length
), 'Text prompt variable aliases must be unique.').transform((variables) => (
  variables.map((variable, index) => ({ ...variable, id: `variable-${index}` }))
));

const extractLayerSchema = z.enum(['default', ...extractLayerDefinitions.map((layer) => layer.id)]);

const pipelineSettingValueSchemas = {
  ...imageGenerationOptionsSchema.shape,
  analysisPreset: z.enum(['composition', 'graphics', 'character', 'location']),
  preset: extractLayerSchema,
  presets: z.array(extractLayerSchema).min(1).max(32),
  outputScope: z.enum(['selected', 'all']),
  activeShotIndex: z.number().int().min(0).max(99),
  storyMode: z.enum(['slide', 'sequence']),
  storyTitle: z.string().refine((text) => countStoryTextCharacters(text) <= STORY_CONTENT_LIMITS_V1.title),
  subtitle: z.string().refine((text) => countStoryTextCharacters(text) <= STORY_CONTENT_LIMITS_V1.subtitle),
  locale: z.string().min(2).max(35),
  styleProfileId: z.string().min(1).max(120),
  styleRevisionId: z.string().min(1).max(120),
  mode: z.enum(['text', 'frames', 'references']),
  duration: z.number().int().min(1).max(30),
  resolution: z.string().min(1).max(16),
  generateAudio: z.boolean(),
  seed: z.number().int().min(0).max(2147483647),
  referenceDescriptions: z.array(z.string().max(2000)).max(3),
  aspectRatio: z.string().trim().min(1).max(24),
  crop: z.object({
    x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1),
    width: z.number().finite().positive().max(1), height: z.number().finite().positive().max(1),
  }).strict().refine((crop) => crop.x + crop.width <= 1 + 1e-9 && crop.y + crop.height <= 1 + 1e-9,
    'Crop frame must stay inside the source.'),
  background: z.enum(['transparent', 'white', 'black']),
  bitrateKbps: audioConvertOptionsSchema.shape.bitrateKbps.unwrap(),
  channels: audioConvertOptionsSchema.shape.channels.unwrap(),
  content: z.string()
    .max(QR_CODE_LIMITS.maxContentBytes)
    .refine((value) => (
      new TextEncoder().encode(value).byteLength <= QR_CODE_LIMITS.maxContentBytes
    ), 'QR content is limited to 2048 UTF-8 bytes.'),
  contentMode: z.enum(['url', 'text']),
  customSeparator: z.string().max(80),
  delimiter: z.string().max(40),
  format: z.enum(['png', 'jpeg', 'webp', 'mp3', 'wav', 'flac', 'ogg']),
  instruction: longTextSchema,
  fields: pipelineContractFieldsSchema,
  language: z.string().trim().min(1).max(80),
  localText: z.string().trim().max(30_000),
  model: z.string().trim().min(1).max(160),
  outputStyle: z.enum(['plain', 'markdown', 'numbered-list']),
  presentation: z.enum(['card', 'bubble']).transform(() => 'card'),
  prefix: z.string().max(1_000),
  presetId: z.enum(['universal', 'telegram-post', 'blog-article', 'markdown']),
  prompt: longTextSchema,
  quality: z.string().regex(/^\d{1,3}$/),
  reasoning: z.enum(['low', 'medium', 'high']),
  responseFormat: z.enum(['mp3', 'pcm']),
  sampleRateHz: audioConvertOptionsSchema.shape.sampleRateHz.unwrap(),
  scale: z.enum(['1', '0.75', '0.5', '0.25']),
  separator: z.enum(['newline', 'double-newline', 'space', 'custom']),
  size: z.string().trim().min(1).max(16),
  speed: z.number().min(0.25).max(4),
  schemaName: z.string().trim().min(1).max(80).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  suffix: z.string().max(1_000),
  temperature: z.number().min(0).max(2),
  threshold: z.number().finite().min(1).max(60),
  text: longTextSchema,
  title: shortTextSchema,
  voice: z.string().trim().min(1).max(100),
  videoAudioTrackIndex: z.number().int().min(0).max(31),
  variableDisplayMode: z.enum(['source-value', 'value', 'source']),
  variables: textPromptVariablesSchema,
} satisfies Record<PipelineNodeSetting, z.ZodType>;

export type SanitizedPipelineNodeSettingValue = string | number | boolean | string[] | CropRect | PipelineContractField[] | TextPromptVariable[];
export type SanitizedPipelineNodeSettings = Record<string, SanitizedPipelineNodeSettingValue>;

export const pipelineNodeSettingsSchema = z.record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length <= 24, 'Node settings are limited to 24 fields.');

export function sanitizePipelineNodeSettings(
  type: ProductionNodeType,
  settings?: z.infer<typeof pipelineNodeSettingsSchema>,
  nodeKey?: string,
  warnings: string[] = [],
): SanitizedPipelineNodeSettings {
  if (!settings) return {};
  settings = normalizeTextGenerationPrompt(type, settings, nodeKey, warnings);
  const allowed = new Set<PipelineNodeSetting>(PIPELINE_NODE_CONFIGURABLE_FIELDS[type]);
  const supportedEntries: Array<[string, SanitizedPipelineNodeSettingValue]> = [];
  for (const [key, value] of Object.entries(settings)) {
    if (!isPipelineNodeSetting(key) || !allowed.has(key)) {
      warnings.push(`Настройка ${key} пропущена для ${nodeKey ?? type}: эта нода её не поддерживает.`);
      continue;
    }
    const schema = type === 'cropImage' && key === 'aspectRatio'
      ? z.enum(cropAspectRatioOptions as [string, ...string[]])
      : type === 'reverieStories' && key === 'text'
      ? z.string().refine((text) => countStoryTextCharacters(text) <= STORY_CONTENT_LIMITS_V1.text)
      : key === 'format'
      ? type === 'audioConvert' ? audioConvertOptionsSchema.shape.format : z.enum(['png', 'jpeg', 'webp'])
      : key === 'language' && type === 'textToSpeech' ? z.enum(['auto', 'ru', 'en', 'de', 'es', 'zh'])
        : key === 'model' && type === 'timelineHandoff' ? pipelineSettingValueSchemas.model.refine(isTimelineModel)
          : pipelineSettingValueSchemas[key];
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      if (type === 'cropImage' && key === 'crop') {
        throw new Error(`Некорректная рамка ${nodeKey ?? type}.crop: задайте x, y, width и height в пределах исходного кадра (0..1). Рамка не изменена.`);
      }
      if (type === 'reverieStories' && ['storyTitle', 'subtitle', 'text'].includes(key)) {
        throw new Error(`Сократите ${nodeKey ?? type}.${key}: заголовок до 100, подзаголовок до 160, текст до 600 символов. Исходный текст не изменён.`);
      }
      if (key === 'text' || key === 'instruction' || key === 'prompt') {
        throw new Error(`Invalid ${nodeKey ?? type}.settings.${key}: provide a string of at most 4000 characters; split longer content into textPrompt nodes with textConcat. Text was not applied or discarded.`);
      }
      warnings.push(`Настройка ${key} пропущена для ${nodeKey ?? type}: значение не поддерживается.`);
      continue;
    }
    if (key === 'variables' && JSON.stringify(value) !== JSON.stringify(parsed.data)) {
      warnings.push(`Идентификаторы variables ноды ${nodeKey ?? type} нормализованы в variable-0, variable-1 и так далее.`);
    }
    supportedEntries.push([key, parsed.data as SanitizedPipelineNodeSettingValue]);
  }
  const result = Object.fromEntries(supportedEntries);
  if (type === 'audioConvert' && result.format === 'ogg' && result.sampleRateHz === 44100) {
    delete result.sampleRateHz;
    warnings.push(`Настройка sampleRateHz пропущена для ${nodeKey ?? type}: Ogg Opus не поддерживает 44.1 kHz; частота будет выбрана автоматически.`);
  }
  return result;
}

function normalizeTextGenerationPrompt(
  type: ProductionNodeType,
  settings: Record<string, unknown>,
  nodeKey: string | undefined,
  warnings: string[],
): Record<string, unknown> {
  if (type !== 'textGeneration' || !Object.hasOwn(settings, 'prompt')) return settings;
  const { prompt, ...rest } = settings;
  if (Object.hasOwn(rest, 'instruction') && rest.instruction !== prompt) {
    throw new Error(`Conflicting ${nodeKey ?? type}.settings.prompt and instruction: use only instruction for Text Gen rules; move source content to a connected textPrompt.settings.text. No text was discarded.`);
  }
  warnings.push(`Настройка prompt для ${nodeKey ?? type} нормализована в instruction: текст сохранён. Используйте settings.instruction для Text Gen.`);
  return { ...rest, instruction: prompt };
}

export function toSafePreviewSettings(settings: SanitizedPipelineNodeSettings): Record<string, string | number> {
  return Object.fromEntries(Object.entries(settings).flatMap(([key, value]) => {
    if (key === 'presets' && Array.isArray(value)) return [[key, value.join(', ')]];
    if ((key === 'variables' || key === 'fields') && Array.isArray(value)) return [[key, value.length]];
    return typeof value === 'string' || typeof value === 'number' ? [[key, value]] : [];
  }));
}

function isPipelineNodeSetting(value: string): value is PipelineNodeSetting {
  return value in pipelineSettingValueSchemas;
}
