import requestSchemaJson from '../../../../contracts/story-production/1.0.0/request.schema.json' with { type: 'json' };
import resultSchemaJson from '../../../../contracts/story-production/1.0.0/result.schema.json' with { type: 'json' };
import type { SemanticJsonSchema } from '@/shared/contracts/semantic-contract';
import type {
  PipelineContractField,
  PipelineSemanticContractSnapshot,
} from './pipeline-contract-fields';

export type PipelineBoundaryKind = 'input' | 'output';

export interface PipelineSemanticContractPreset {
  boundary: PipelineBoundaryKind;
  description: string;
  fields: PipelineContractField[];
  label: string;
  semanticContract: PipelineSemanticContractSnapshot;
}

const requestSchema = requestSchemaJson as SemanticJsonSchema;
const resultSchema = resultSchemaJson as SemanticJsonSchema;

const PRESETS: readonly PipelineSemanticContractPreset[] = [{
  boundary: 'input',
  label: 'Story production request · v1',
  description: 'Данные для генерации одного фонового изображения Stories.',
  semanticContract: {
    contractKey: 'story.production.request.v1',
    contractVersion: '1.0.0',
    contractRef: 'urn:prodaction:story.production.request:1.0.0',
    schemaChecksum: '8aafa0a49b1b633d795b83a2b7f5e7274f5c7c8554b3e76b1de64c44a1780063',
    schema: requestSchema,
  },
  fields: [
    field('story-request-story-id', 'storyId', 'Идентификатор Stories.'),
    field('story-request-revision-id', 'revisionId', 'Неизменяемая версия Stories.'),
    field('story-request-slide-id', 'slideId', 'Идентификатор одного слайда.'),
    field('story-request-brief', 'brief', 'Что должно быть изображено на фоне.'),
    field('story-request-alt-text', 'altText', 'Краткое описание смысла изображения.', false),
    field('story-request-locale', 'locale', 'Язык контента.'),
    field('story-request-aspect-ratio', 'aspectRatio', 'Формат кадра Stories.'),
    field('story-request-image-size', 'imageSize', 'Размер генерации у модели.'),
    field('story-request-format-key', 'formatKey', 'Точный формат Composition.'),
  ],
}, {
  boundary: 'output',
  label: 'Story production result · v1',
  description: 'Ссылка, метаданные и checksum готового фонового изображения.',
  semanticContract: {
    contractKey: 'story.production.result.v1',
    contractVersion: '1.0.0',
    contractRef: 'urn:prodaction:story.production.result:1.0.0',
    schemaChecksum: '362b07da2768b2898084193ce4ba5e98f9aa78521c30fc3ef6ea967de65ccf27',
    schema: resultSchema,
  },
  fields: [{
    id: 'story-result-background',
    key: 'background',
    kind: 'image',
    required: true,
    description: 'Готовое фоновое изображение с защищённой ссылкой на скачивание.',
  }],
}] as const;

export function getPipelineSemanticContractPresets(boundary: PipelineBoundaryKind) {
  return PRESETS.filter((preset) => preset.boundary === boundary).map(clonePreset);
}

export function getPipelineSemanticContractPreset(contractKey: string) {
  const preset = PRESETS.find((candidate) => candidate.semanticContract.contractKey === contractKey);
  return preset ? clonePreset(preset) : undefined;
}

function field(
  id: string,
  key: string,
  description: string,
  required = true,
): PipelineContractField {
  return {
    id,
    key,
    kind: 'text',
    required,
    description,
  };
}

function clonePreset(preset: PipelineSemanticContractPreset): PipelineSemanticContractPreset {
  return structuredClone(preset);
}
