import { createPipelineContractField } from './pipeline-contract-fields';
import type { ProductionNodeDefinitionMap } from './node-registry-types';

export const pipelineNodeDefinitions = {
  pipelineInput: {
    type: 'pipelineInput',
    title: 'Pipeline Input',
    menuLabel: 'Pipeline input',
    collapsible: true,
    defaultHeight: 190,
    ports: [],
    createData: () => ({
      title: 'Pipeline Input',
      fields: [createPipelineContractField(0, { key: 'input' })],
    }),
  },
  pipelineOutput: {
    type: 'pipelineOutput',
    title: 'Pipeline Output',
    menuLabel: 'Pipeline output',
    collapsible: true,
    defaultHeight: 190,
    ports: [],
    createData: () => ({
      title: 'Pipeline Output',
      fields: [createPipelineContractField(0, { key: 'result' })],
    }),
  },
  structuredOutput: {
    type: 'structuredOutput',
    title: 'Structured Output',
    menuLabel: 'Structured output',
    collapsible: true,
    defaultHeight: 310,
    ports: [
      { id: 'source', label: 'Source', kind: 'any', side: 'input' },
      { id: 'json', label: 'JSON', kind: 'json', side: 'output' },
    ],
    createData: () => ({
      title: 'Structured Output',
      fields: [createPipelineContractField(0, { key: 'result' })],
      instruction: 'Extract a valid JSON object that matches the configured schema.',
      model: 'google/gemini-2.5-flash',
      reasoning: 'low',
      schemaName: 'pipeline_output',
      temperature: 0,
    }),
  },
} satisfies ProductionNodeDefinitionMap<'pipelineInput' | 'pipelineOutput' | 'structuredOutput'>;
