import type {
  ProductionNode,
  ProductionNodeData,
} from '@/entities/production-graph/model/types';
import type { SanitizedPipelineNodeSettings } from './pipeline-build';

export function normalizeTextPromptTargetPort(input: {
  currentById: Map<string, ProductionNode>;
  requestedPortId: string;
  settingsByNodeId: Map<string, SanitizedPipelineNodeSettings>;
  target: ProductionNode;
  warnings: string[];
}) {
  if (input.target.type !== 'textPrompt') return input.requestedPortId;
  const requestedVariableIndex = readTextPromptVariableIndex(input.requestedPortId);
  if (requestedVariableIndex < 0) return input.requestedPortId;
  const targetPortId = `variable-${requestedVariableIndex}`;
  const data = input.target.data as ProductionNodeData & {
    text?: string;
    variables?: Array<{ alias: string; id: string }>;
  };
  const variables = Array.isArray(data.variables) ? [...data.variables] : [];
  for (let index = 0; index <= requestedVariableIndex; index += 1) {
    const id = `variable-${index}`;
    if (!variables.some((variable) => variable.id === id)) {
      variables.push({ alias: `Variable ${index + 1}`, id });
    }
  }
  variables.sort((first, second) => readTextPromptVariableIndex(first.id) - readTextPromptVariableIndex(second.id));
  const aliases = variables.map((variable) => variable.alias.trim()).filter(Boolean);
  const currentText = typeof data.text === 'string' ? data.text : '';
  const missingMentions = aliases.filter((alias) => !currentText.includes(`@${alias}`));
  const text = missingMentions.length > 0
    ? [currentText.trim(), ...missingMentions.map((alias) => `@${alias}`)].filter(Boolean).join('\n\n')
    : currentText;
  input.target.data = { ...input.target.data, text, variables } as ProductionNodeData;
  if (input.currentById.has(input.target.id)) {
    input.settingsByNodeId.set(input.target.id, {
      ...(input.settingsByNodeId.get(input.target.id) ?? {}),
      text,
      variables,
    });
  }
  if (input.requestedPortId !== targetPortId) {
    input.warnings.push(`Порт ${input.requestedPortId} ноды textPrompt исправлен на ${targetPortId}.`);
  }
  if (missingMentions.length > 0) {
    input.warnings.push(`В шаблон textPrompt добавлены отсутствовавшие переменные: ${missingMentions.join(', ')}.`);
  }
  return targetPortId;
}

function readTextPromptVariableIndex(portId: string) {
  const match = /^(?:variable|text)-([0-9])$/.exec(portId);
  return match ? Number(match[1]) : -1;
}
