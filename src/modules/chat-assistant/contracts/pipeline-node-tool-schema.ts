import { extractLayerDefinitions } from '@/entities/production-graph/model/extract-analysis-profiles';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import { QR_CODE_LIMITS } from '@/shared/qr-code';

const PIPELINE_SETTING_SCHEMAS = {
  imageQuality: { type: 'string', enum: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'], description: 'Generate Image only; choose a supported value from node_catalog.imageGenerationModels.' },
  imageBackground: { type: 'string', enum: ['auto', 'transparent', 'opaque'] },
  imageFormat: { type: 'string', enum: ['png', 'jpeg', 'webp'] },
  imageCompression: { type: 'integer', minimum: 0, maximum: 100, description: 'Only when the model supports output_compression and imageFormat is jpeg or webp.' },
  imageSeed: { type: 'integer', minimum: 0, maximum: 2147483647 },
  analysisPreset: { type: 'string', enum: ['composition', 'graphics', 'character', 'location'], description: 'Extract analysis framework; default composition preserves legacy nodes. Select the framework before selecting its Layers.' },
  preset: { type: 'string', enum: ['default', ...extractLayerDefinitions.map((layer) => layer.id)], description: 'Extract legacy single-layer selector. Prefer presets; default means all layers of analysisPreset.' },
  presets: { type: 'array', minItems: 1, maxItems: 32, uniqueItems: true, items: { type: 'string', enum: ['default', ...extractLayerDefinitions.map((layer) => layer.id)] }, description: 'Extract Layers, limited to the selected analysisPreset. Use [default] for all profile layers. Read node_catalog for exact profile layer keys.' },
  outputScope: { type: 'string', enum: ['selected', 'all'], description: 'Timeline Handoff typed Frames/Descriptions/Fragments outputs: selected current shot or all ordered shots. timeline JSON always stays complete.' },
  activeShotIndex: { type: 'integer', minimum: 0, maximum: 99, description: 'Timeline Handoff selected zero-based shot index. In selected outputScope this controls Frames/Descriptions/Fragments outputs; use only a shot in the existing analysis.' },
  storyMode: { type: 'string', enum: ['slide', 'sequence'], description: 'REVERIE Stories: slide assembles semantic fields; sequence joins document/document-2..12 inputs in numeric port order.' },
  storyTitle: { type: 'string', maxLength: 100, description: 'REVERIE Stories slide/preview title, up to 100 Unicode characters. title is the canvas node label.' },
  subtitle: { type: 'string', maxLength: 160, description: 'REVERIE Stories subtitle, separately styled from title and text.' },
  locale: { type: 'string', minLength: 2, maxLength: 35 },
  styleProfileId: { type: 'string', minLength: 1, maxLength: 120, description: 'Existing versioned Stories style profile. Do not fabricate profile IDs.' },
  styleRevisionId: { type: 'string', minLength: 1, maxLength: 120, description: 'Pinned revision of the selected Stories style profile.' },
  mode: { type: 'string', enum: ['text', 'frames', 'references'], description: 'Generate Video uses exclusive modes. text: prompt only. frames: prompt + required first-frame and optional supported last-frame. references: prompt + reference-1..3 and matching referenceDescriptions. Never connect inactive-mode image ports.' },
  duration: { type: 'integer', minimum: 1, maximum: 30, description: 'Video seconds; must be a discrete duration from the live model catalog.' },
  resolution: { type: 'string', maxLength: 16, description: 'Video resolution from live model capabilities.' },
  generateAudio: { type: 'boolean', description: 'Generate Video: audio only when the selected model supports it.' },
  seed: { type: 'integer', minimum: 0, maximum: 2147483647 },
  referenceDescriptions: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 2000 }, description: 'Generate Video references mode only. Array index N describes stable input reference-(N+1); keep empty placeholders before later slots.' },
  aspectRatio: { type: 'string', minLength: 1, maxLength: 24, description: 'Set the requested supported image/video ratio explicitly, e.g. 16:9. Crop uses this format or a normalized explicit crop rectangle. A ratio in the document name or prompt does not configure the node.' },
  crop: {
    type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'],
    description: 'Crop only: normalized spatial frame within the source (0..1), not time trimming. x + width and y + height must not exceed 1. Omit to choose a centered aspectRatio frame. A fixed aspectRatio fits the explicit frame to that format while preserving its origin; Custom preserves its exact bounds. Source-specific result asset IDs are never settings.',
    properties: {
      x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 },
      width: { type: 'number', exclusiveMinimum: 0, maximum: 1 }, height: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
    },
  },
  background: { type: 'string', enum: ['transparent', 'white', 'black'] },
  bitrateKbps: { type: 'number', enum: [64, 96, 128, 192, 256, 320] },
  channels: { type: 'number', enum: [1, 2] },
  content: {
    type: 'string',
    maxLength: QR_CODE_LIMITS.maxContentBytes,
    description: 'Local QR fallback value. Leave empty when a Pipeline Input is connected to qrCode.text.',
  },
  contentMode: { type: 'string', enum: ['url', 'text'] },
  customSeparator: { type: 'string', maxLength: 80 },
  delimiter: { type: 'string', maxLength: 40, description: 'Splitter delimiter. Named [SECTION] fragments keep their saved item-N slots when filtered or reordered; missing sections output empty text. Plain lists remain positional. Read document_graph for existing item-N connections; do not renumber them. itemKeys is internal, not an editable setting.' },
  format: { type: 'string', enum: ['png', 'jpeg', 'webp', 'mp3', 'wav', 'flac', 'ogg'], description: 'Export image accepts png/jpeg/webp; Audio convert accepts mp3/wav/flac/ogg (Opus). Formats cannot cross node types.' },
  instruction: { type: 'string', maxLength: 4_000, description: 'Text Gen processing rules live in textGeneration.settings.instruction, not prompt. Fill task-specific rules; source content belongs in a connected textPrompt.settings.text.' },
  language: { type: 'string', minLength: 1, maxLength: 80, description: 'Speech to text language hint or auto; Voice uses only the languages offered by its model. Timeline Handoff defaults to the application language; omit or use system.' },
  localText: { type: 'string', maxLength: 30_000, description: 'Voice fallback text. Over 5000 characters is split and assembled on the server into one MP3; at most 30000 characters total.' },
  model: { type: 'string', minLength: 1, maxLength: 160, description: 'Explicit compatible model ID; Auto Router is unavailable. Account favorites, popularity and selector tabs are personal UI preferences, not node settings.' },
  outputStyle: { type: 'string', enum: ['plain', 'markdown', 'numbered-list'] },
  presentation: { type: 'string', enum: ['card', 'bubble'], description: 'textPrompt uses the ordinary card. Legacy bubble is accepted but normalized to card. Section badges above text fields transfer text into a Prompt or another editable field; no new executor or AI call.' },
  presetId: { type: 'string', enum: ['universal', 'telegram-post', 'blog-article', 'markdown'] },
  prefix: { type: 'string', maxLength: 1_000 },
  prompt: { type: 'string', maxLength: 4_000, description: 'Local image-generation/extraction prompt on node types that allow prompt. Not the canonical Text Gen field (use instruction). Node keys such as @brief are not template variables here.' },
  quality: { type: 'string', pattern: '^\\d{1,3}$' },
  reasoning: { type: 'string', enum: ['low', 'medium', 'high'] },
  responseFormat: { type: 'string', enum: ['mp3', 'pcm'], description: 'Voice provider response format; use Audio convert for a final WAV/FLAC/Ogg file.' },
  sampleRateHz: { type: 'number', enum: [16000, 24000, 44100, 48000], description: 'Audio convert rate. Ogg Opus rejects 44100: use 16000/24000/48000 or omit for automatic selection.' },
  scale: { type: 'string', enum: ['1', '0.75', '0.5', '0.25'] },
  separator: { type: 'string', enum: ['newline', 'double-newline', 'space', 'custom'] },
  size: { type: 'string', minLength: 1, maxLength: 16 },
  speed: { type: 'number', minimum: 0.25, maximum: 4 },
  schemaName: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$', minLength: 1, maxLength: 80 },
  suffix: { type: 'string', maxLength: 1_000 },
  temperature: { type: 'number', minimum: 0, maximum: 2 },
  threshold: { type: 'number', minimum: 1, maximum: 60, description: 'Timeline Handoff cut-detection threshold, default 10. Lower values find more possible cuts; independent from descriptions.' },
  text: { type: 'string', maxLength: 4_000, description: 'Text prompt source content or a declared @Alias template. Preserve the complete brief, not just its final paragraph. Split longer content across textPrompt nodes and textConcat.' },
  title: { type: 'string', minLength: 1, maxLength: 120 },
  voice: { type: 'string', minLength: 1, maxLength: 100 },
  videoAudioTrackIndex: { type: 'integer', minimum: 0, maximum: 31, description: 'Import video only: existing absolute audio stream index from file metadata, not an array position. Do not guess.' },
  variableDisplayMode: { type: 'string', enum: ['source-value', 'value', 'source'] },
  variables: {
    type: 'array',
    maxItems: 10,
    description: 'Sequential textPrompt inputs. Array index N must use id variable-N; aliases must be unique and referenced from settings.text as @Alias. When the source is a Pipeline Input field, use its public field.key as the alias.',
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
  fields: createContractFieldsSchema(0),
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
    description: 'Exact node object. Use only key, type, optional settings and optional sourceAttachmentIndex. Put title and all other configurable values inside settings; never add top-level id, name, label or position.',
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
      sourceAttachmentIndex: {
        type: 'integer',
        minimum: 0,
        maximum: 2,
        description: 'For importImage only: zero-based image index from the latest user message that contains attachments. The product copies it to a durable document asset after confirmation.',
      },
    },
  };
}

function createContractFieldsSchema(depth: number): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    id: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]*$', minLength: 1, maxLength: 80 },
    key: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$', minLength: 1, maxLength: 80 },
    kind: { type: 'string', enum: ['text', 'number', 'boolean', 'image', 'audio', 'video', 'json'] },
    required: { type: 'boolean' },
    description: { type: 'string', maxLength: 500 },
    defaultValue: createContractDefaultValueSchema(0),
  };
  if (depth < 2) properties.fields = createContractFieldsSchema(depth + 1);
  return {
    type: 'array',
    maxItems: 24,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'key', 'kind', 'required'],
      properties,
    },
  };
}

function createContractDefaultValueSchema(depth: number): Record<string, unknown> {
  const scalarVariants: Array<Record<string, unknown>> = [
    { type: 'string', maxLength: 4_000 },
    { type: 'number', minimum: -1_000_000_000, maximum: 1_000_000_000 },
    { type: 'boolean' },
    { type: 'null' },
  ];
  if (depth >= 3) return { anyOf: scalarVariants };
  return {
    anyOf: [
      ...scalarVariants,
      {
        type: 'array',
        maxItems: 24,
        items: createContractDefaultValueSchema(depth + 1),
      },
      {
        type: 'object',
        maxProperties: 24,
        additionalProperties: createContractDefaultValueSchema(depth + 1),
      },
    ],
  };
}
