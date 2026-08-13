import {
  createPipelineNodeSchema,
  createPipelineSettingsSchema,
} from './pipeline-node-tool-schema';

export const pipelineUpdateInputJsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary'],
  properties: {
    summary: {
      type: 'string',
      minLength: 4,
      maxLength: 280,
      description: 'Short user-facing description of the approved graph update.',
    },
    nodes: {
      type: 'array',
      maxItems: 12,
      description: 'New nodes. Their local keys may be referenced from edges. Omit when no nodes are added.',
      items: createPipelineNodeSchema(),
    },
    updates: {
      type: 'array',
      maxItems: 12,
      description: 'Allowlisted setting changes for existing node ids returned by document_graph. Omit when unchanged.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nodeId', 'settings'],
        properties: {
          nodeId: { type: 'string', minLength: 1, maxLength: 120 },
          settings: createPipelineSettingsSchema(),
        },
      },
    },
    removeEdgeIds: {
      type: 'array',
      maxItems: 24,
      uniqueItems: true,
      description: 'Existing edge ids returned by document_graph that must be removed. Omit when none are removed.',
      items: { type: 'string', minLength: 1, maxLength: 120 },
    },
    edges: {
      type: 'array',
      maxItems: 24,
      description: 'New edges. A node ref is either a new local key or an existing node id from document_graph. Omit when none are added.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sourceNodeRef', 'sourcePortId', 'targetNodeRef', 'targetPortId'],
        properties: {
          sourceNodeRef: { type: 'string', minLength: 1, maxLength: 120 },
          sourcePortId: { type: 'string', minLength: 1, maxLength: 80 },
          targetNodeRef: { type: 'string', minLength: 1, maxLength: 120 },
          targetPortId: { type: 'string', minLength: 1, maxLength: 80 },
        },
      },
    },
    layout: {
      type: 'object',
      additionalProperties: false,
      description: 'Optional deterministic placement controls for newly added nodes.',
      properties: {
        columnGap: { type: 'integer', minimum: 80, maximum: 400 },
        direction: { type: 'string', enum: ['horizontal', 'vertical'] },
        originX: { type: 'integer', minimum: 80, maximum: 3_400 },
        originY: { type: 'integer', minimum: 80, maximum: 3_400 },
        rowGap: { type: 'integer', minimum: 80, maximum: 400 },
      },
    },
  },
};
