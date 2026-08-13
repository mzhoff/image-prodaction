import type { AgentToolDefinition } from '@prodactionpro/chat-connectors';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import { createPipelineNodeSchema } from './pipeline-node-tool-schema';
import { pipelineUpdateInputJsonSchema } from './pipeline-update-tool-schema';
export type { PipelineNodeSetting } from './pipeline-node-tool-schema';

export const KNOWLEDGE_SEARCH_TOOL = 'knowledge_search';
export const NODE_CATALOG_TOOL = 'node_catalog';
export const DOCUMENT_GRAPH_TOOL = 'document_graph';
export const PIPELINE_BUILD_TOOL = 'pipeline_build';
export const PIPELINE_BUILD_PRESENTATION = 'image-production.pipeline-build';
export const PIPELINE_UPDATE_TOOL = 'pipeline_update';
export const PIPELINE_UPDATE_PRESENTATION = 'image-production.pipeline-update';

export const PIPELINE_NODE_CONFIGURABLE_FIELDS: Record<
  (typeof PRODUCTION_NODE_TYPES)[number],
  readonly import('./pipeline-node-tool-schema').PipelineNodeSetting[]
> = {
  adjustment: ['title'], banner: ['title'], composition: ['title', 'aspectRatio', 'size'],
  cropImage: ['title', 'aspectRatio'], curves: ['title'],
  exportImage: ['title', 'format', 'quality', 'scale', 'background'],
  frequencyRetouch: ['title'], generateImage: ['title', 'prompt', 'aspectRatio', 'size'],
  imageToText: ['title', 'prompt'], importImage: ['title'], iterator: ['title'],
  locationBuilder: ['title'], preview: ['title'],
  referenceComposer: ['title', 'prompt', 'aspectRatio', 'size'],
  refineImage: ['title', 'instruction', 'size'], removeBackground: ['title'], router: ['title'],
  sketch: ['title', 'aspectRatio'], subjectBuilder: ['title'], telegramPublication: ['title'],
  textConcat: ['title', 'separator', 'customSeparator', 'prefix', 'suffix'],
  textFormatter: ['title', 'presetId'],
  textGeneration: ['title', 'instruction', 'outputStyle', 'reasoning', 'temperature'],
  textPrompt: ['title', 'text', 'variables', 'variableDisplayMode'],
  textSplitter: ['title', 'delimiter'], textToSpeech: ['title'],
};

export const imageProductionTools: AgentToolDefinition[] = [
  {
    name: KNOWLEDGE_SEARCH_TOOL,
    description: 'Search the product-owned Image Production knowledge base for verified product guidance.',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 240 },
        maxResults: { type: 'integer', minimum: 1, maximum: 5 },
      },
    },
  },
  {
    name: NODE_CATALOG_TOOL,
    description: 'Read the live server-owned catalog of Image Production node types, purposes, aliases, dynamic port rules and configurable fields. Query an exact candidate such as textConcat before concluding that a node is unavailable.',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', maxLength: 120 },
      },
    },
  },
  {
    name: DOCUMENT_GRAPH_TOOL,
    description: 'Read a bounded server-verified projection of the current Image Production document: node ids, types, configurable settings, positions, ports and edge ids. Use it before proposing or preparing changes to an existing graph.',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: PIPELINE_BUILD_TOOL,
    description: [
      'Prepare a validated set of nodes and connections in the current Image Production document.',
      'Use only after the user has reviewed the textual plan and explicitly asked to build it.',
      'The action always requires a separate UI confirmation before the graph changes.',
      'Use node_catalog first and only pass settings listed in configurableFields for each node type.',
      'Set documentName to a concise task-oriented name instead of Untitled Pipeline.',
      'Represent user-editable text inputs such as notes, briefs, topics or source text with separate textPrompt nodes connected to the consuming node.',
    ].join(' '),
    riskLevel: 'write',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['documentName', 'summary', 'nodes', 'edges'],
      properties: {
        documentName: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
          description: 'Concise semantic name for the document, describing the task this pipeline solves.',
        },
        summary: {
          type: 'string',
          minLength: 4,
          maxLength: 280,
          description: 'Short user-facing description of the pipeline that will be created.',
        },
        nodes: {
          type: 'array',
          minItems: 1,
          maxItems: 12,
          items: createPipelineNodeSchema(),
        },
        edges: {
          type: 'array',
          maxItems: 24,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['sourceNodeKey', 'sourcePortId', 'targetNodeKey', 'targetPortId'],
            properties: {
              sourceNodeKey: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$', maxLength: 48 },
              sourcePortId: { type: 'string', minLength: 1, maxLength: 80 },
              targetNodeKey: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$', maxLength: 48 },
              targetPortId: { type: 'string', minLength: 1, maxLength: 80 },
            },
          },
        },
        layout: {
          type: 'object',
          additionalProperties: false,
          description: 'Optional deterministic layout controls. Omit coordinates to place the recipe beside the current graph.',
          properties: {
            columnGap: { type: 'integer', minimum: 80, maximum: 400 },
            direction: { type: 'string', enum: ['horizontal', 'vertical'] },
            originX: { type: 'integer', minimum: 80, maximum: 3_400 },
            originY: { type: 'integer', minimum: 80, maximum: 3_400 },
            rowGap: { type: 'integer', minimum: 80, maximum: 400 },
          },
        },
      },
    },
  },
  {
    name: PIPELINE_UPDATE_TOOL,
    description: [
      'Prepare a validated update to the existing Image Production graph after the user approves a textual plan.',
      'Use document_graph first and reference its real node and edge ids.',
      'The update may add nodes, update allowlisted settings, remove named edges and add replacement edges.',
      'Use textPrompt plus textConcat when independently editable notes, rules or style must feed one textGeneration input.',
      'To replace textConcat with a template, configure textPrompt.variables as variable-0..variable-9, reference them as @Alias in settings.text, and connect sources to the matching variable-N input ports.',
      'The exact top-level fields are summary, nodes, updates, removeEdgeIds, edges and optional layout; omit unchanged arrays.',
      'This action never runs generation, publishes, exports or deletes nodes, and always requires a separate UI confirmation.',
    ].join(' '),
    riskLevel: 'write',
    inputSchema: pipelineUpdateInputJsonSchema,
  },
];
