import { normalizeNodeSize } from './node-layout';
import { normalizePipelineContractFields } from './pipeline-contract-fields';
import type { ProductionNode } from './types';

export function normalizePipelineNode(node: ProductionNode): ProductionNode | null {
  if (node.type === 'pipelineInput' || node.type === 'pipelineOutput') {
    const data = node.data as unknown as Record<string, unknown>;
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        ...data,
        fields: normalizePipelineContractFields(data.fields),
        title: normalizeTitle(data.title, node.type === 'pipelineInput' ? 'Pipeline Input' : 'Pipeline Output'),
      },
    } as ProductionNode;
  }

  if (node.type === 'structuredOutput') {
    const data = node.data as unknown as Record<string, unknown>;
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        ...data,
        fields: normalizePipelineContractFields(data.fields),
        instruction: typeof data.instruction === 'string' && data.instruction.trim()
          ? data.instruction
          : 'Extract a valid JSON object that matches the configured schema.',
        model: typeof data.model === 'string' && data.model.trim()
          ? data.model
          : 'google/gemini-2.5-flash',
        reasoning: data.reasoning === 'medium' || data.reasoning === 'high' ? data.reasoning : 'low',
        schemaName: typeof data.schemaName === 'string' && data.schemaName.trim()
          ? data.schemaName.trim()
          : 'pipeline_output',
        temperature: normalizeTemperature(data.temperature),
        title: normalizeTitle(data.title, 'Structured Output'),
      },
    } as ProductionNode;
  }

  return null;
}

function normalizeTitle(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeTemperature(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(2, value));
}
