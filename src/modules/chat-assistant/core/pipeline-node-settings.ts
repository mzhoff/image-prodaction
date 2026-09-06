import { z } from 'zod';
import type {
  PipelineContractField,
  ProductionNodeType,
  TextPromptVariable,
} from '@/entities/production-graph/model/types';
import { QR_CODE_LIMITS } from '@/shared/qr-code';
import { audioConvertOptionsSchema } from '@/shared/media/audio-contracts';
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

const pipelineSettingValueSchemas = {
  aspectRatio: z.string().trim().min(1).max(24),
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
  localText: longTextSchema,
  model: z.string().trim().min(1).max(160),
  outputStyle: z.enum(['plain', 'markdown', 'numbered-list']),
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
  text: longTextSchema,
  title: shortTextSchema,
  voice: z.string().trim().min(1).max(100),
  variableDisplayMode: z.enum(['source-value', 'value', 'source']),
  variables: textPromptVariablesSchema,
} satisfies Record<PipelineNodeSetting, z.ZodType>;

export type SanitizedPipelineNodeSettingValue = string | number | PipelineContractField[] | TextPromptVariable[];
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
  const allowed = new Set<PipelineNodeSetting>(PIPELINE_NODE_CONFIGURABLE_FIELDS[type]);
  const supportedEntries: Array<[string, SanitizedPipelineNodeSettingValue]> = [];
  for (const [key, value] of Object.entries(settings)) {
    if (!isPipelineNodeSetting(key) || !allowed.has(key)) {
      warnings.push(`Настройка ${key} пропущена для ${nodeKey ?? type}: эта нода её не поддерживает.`);
      continue;
    }
    const schema = key === 'format'
      ? type === 'audioConvert' ? audioConvertOptionsSchema.shape.format : z.enum(['png', 'jpeg', 'webp'])
      : key === 'language' && type === 'textToSpeech' ? z.enum(['auto', 'ru', 'en', 'de', 'es', 'zh'])
        : pipelineSettingValueSchemas[key];
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
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

export function toSafePreviewSettings(settings: SanitizedPipelineNodeSettings): Record<string, string | number> {
  return Object.fromEntries(Object.entries(settings).flatMap(([key, value]) => {
    if ((key === 'variables' || key === 'fields') && Array.isArray(value)) return [[key, value.length]];
    return typeof value === 'string' || typeof value === 'number' ? [[key, value]] : [];
  }));
}

function isPipelineNodeSetting(value: string): value is PipelineNodeSetting {
  return value in pipelineSettingValueSchemas;
}
