import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';

const PIPELINE_SETTING_SCHEMAS = {
  aspectRatio: { type: 'string', minLength: 1, maxLength: 24 },
  background: { type: 'string', enum: ['transparent', 'white', 'black'] },
  customSeparator: { type: 'string', maxLength: 80 },
  delimiter: { type: 'string', maxLength: 40 },
  format: { type: 'string', enum: ['png', 'jpeg', 'webp'] },
  instruction: { type: 'string', maxLength: 4_000 },
  outputStyle: { type: 'string', enum: ['plain', 'markdown', 'numbered-list'] },
  presetId: { type: 'string', enum: ['universal', 'telegram-post', 'blog-article', 'markdown'] },
  prefix: { type: 'string', maxLength: 1_000 },
  prompt: { type: 'string', maxLength: 4_000 },
  quality: { type: 'string', pattern: '^\\d{1,3}$' },
  reasoning: { type: 'string', enum: ['low', 'medium', 'high'] },
  scale: { type: 'string', enum: ['1', '0.75', '0.5', '0.25'] },
  separator: { type: 'string', enum: ['newline', 'double-newline', 'space', 'custom'] },
  size: { type: 'string', minLength: 1, maxLength: 16 },
  suffix: { type: 'string', maxLength: 1_000 },
  temperature: { type: 'number', minimum: 0, maximum: 2 },
  text: { type: 'string', maxLength: 4_000 },
  title: { type: 'string', minLength: 1, maxLength: 120 },
  variableDisplayMode: { type: 'string', enum: ['source-value', 'value', 'source'] },
  variables: {
    type: 'array',
    maxItems: 10,
    description: 'Sequential textPrompt inputs. Array index N must use id variable-N; aliases must be unique and referenced from settings.text as @Alias.',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'alias'],
      properties: {
        id: { type: 'string', pattern: '^variable-[0-9]$' },
        alias: { type: 'string', minLength: 1, maxLength: 48 },
      },
    },
  },
} as const;

export type PipelineNodeSetting = keyof typeof PIPELINE_SETTING_SCHEMAS;

const FALLBACK_VARIANTS: Array<Record<string, unknown>> = [
  { type: 'string', maxLength: 4_000 },
  { type: 'number', minimum: -10_000, maximum: 10_000 },
  { type: 'boolean' },
  { type: 'null' },
];

export function createPipelineSettingsSchema(): Record<string, unknown> {
  const properties = Object.fromEntries(Object.entries(PIPELINE_SETTING_SCHEMAS)
    .map(([field, schema]) => [field, { anyOf: [schema, ...FALLBACK_VARIANTS] }]));
  return {
    type: 'object',
    maxProperties: 24,
    description: 'Bounded allowlisted node settings. Unsupported values are omitted with preview warnings.',
    additionalProperties: { anyOf: FALLBACK_VARIANTS },
    properties,
  };
}

export function createPipelineNodeSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['key', 'type'],
    properties: {
      key: {
        type: 'string',
        pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$',
        minLength: 1,
        maxLength: 48,
        description: 'Stable local key used by edge definitions inside this proposal.',
      },
      type: { type: 'string', enum: PRODUCTION_NODE_TYPES },
      settings: createPipelineSettingsSchema(),
    },
  };
}
