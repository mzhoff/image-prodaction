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

const resultSchema = resultSchemaJson as SemanticJsonSchema;

const PRESETS: readonly PipelineSemanticContractPreset[] = [{
  boundary: 'output',
  label: 'Story production result · v1',
  description: 'Фоновое изображение и необязательные тексты для одного слайда.',
  semanticContract: {
    contractKey: 'story.production.result.v1',
    contractVersion: '1.0.0',
    contractRef: 'urn:prodaction:story.production.result:1.0.0',
    schemaChecksum: '47aedfb52186e3639df655b8dee3c1f951d96c696af4f4f4ff1d195fcb8e0512',
    schema: resultSchema,
  },
  fields: [
    {
      id: 'story-result-background',
      key: 'background',
      kind: 'image',
      required: true,
      description: 'Готовое фоновое изображение. Его можно скачать по защищённой ссылке.',
    },
    field('story-result-title', 'title', 'Заголовок слайда, если пайплайн его создаёт.', false),
    field('story-result-subtitle', 'subtitle', 'Подзаголовок слайда, если пайплайн его создаёт.', false),
    field('story-result-body', 'body', 'Основной текст слайда, если пайплайн его создаёт.', false),
  ],
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
