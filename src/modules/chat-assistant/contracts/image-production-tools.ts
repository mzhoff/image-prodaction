import type { AgentToolDefinition } from '@prodactionpro/chat-connectors';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import { compositionBlueprintsJsonSchema } from './composition-blueprint-tool-schema';
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
  pipelineInput: ['title', 'fields'], pipelineOutput: ['title', 'fields'],
  locationBuilder: ['title'], preview: ['title'],
  qrCode: ['title', 'content', 'contentMode'],
  referenceComposer: ['title', 'prompt', 'aspectRatio', 'size'],
  refineImage: ['title', 'instruction', 'size'], removeBackground: ['title'], router: ['title'],
  sketch: ['title', 'aspectRatio'], subjectBuilder: ['title'], telegramPublication: ['title'],
  textConcat: ['title', 'separator', 'customSeparator', 'prefix', 'suffix'],
  textFormatter: ['title', 'presetId'],
  textGeneration: ['title', 'instruction', 'outputStyle', 'reasoning', 'temperature'],
  textPrompt: ['title', 'text', 'variables', 'variableDisplayMode'],
  textSplitter: ['title', 'delimiter'], textToSpeech: ['title'],
  structuredOutput: ['title', 'fields', 'instruction', 'model', 'reasoning', 'temperature', 'schemaName'],
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
      'Direct action requests such as build, create, add, change, implement or apply authorize preparing this proposal immediately; never ask for a separate textual confirmation.',
      'This tool creates a read-only UI proposal. The graph changes only after the single UI confirmation.',
      'Use node_catalog first and only pass settings listed in configurableFields for each node type.',
      'Set documentName to a concise task-oriented name instead of Untitled Pipeline.',
      'By default build an ordinary editable canvas pipeline and represent user-editable text such as notes or briefs with textPrompt. Add pipelineInput/pipelineOutput or executable semantics only when the user explicitly requests an endpoint, API, SDK, MCP, external run or Executable Pipeline.',
      'In an ordinary canvas request, phrases such as separate input, prompt input or editable input mean a separate textPrompt node, not pipelineInput.',
      'For a functional QR code, use qrCode and never generateImage. For an executable URL input, declare pipelineInput field { id: "target-url", key: "targetUrl", kind: "text", required: true }, connect field:target-url to qrCode.text, then declare qrCode.image as the source of the QR image layer in compositionBlueprints.',
      'If the user explicitly says that QR is not needed, omit qrCode, targetUrl/target-url and every QR layer from compositionBlueprints even when an earlier plan mentioned QR.',
      'For editable Composition layouts, use top-level compositionBlueprints V1 instead of guessing layer-N. Describe canvas size and each semantic text/image layer with its source, normalized frame and zIndex; the product compiler validates ports and creates Composition layer edges.',
      'QR is an ordinary image layer with role "qr". Image preserveAspectRatio defaults to false; text layers may use a solid color or a linear gradient. A proposal supports at most 24 nodes/layers.',
      'For qrCode V1, pass only title, content or contentMode. Error correction, colors, margin, pixel size and PNG output format are product-owned fixed defaults, not assistant settings.',
      'Building that canvas graph does not prove that QR-to-Composition is publishable; server Composition is a separate future capability and publication validation remains authoritative.',
      'To reuse an image attached to the latest user message on the canvas, add an importImage node with sourceAttachmentIndex 0 for the first image, 1 for the second, or 2 for the third. The product materializes it as a durable asset only after UI confirmation.',
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
          maxItems: 24,
          items: createPipelineNodeSchema(),
        },
        edges: {
          type: 'array',
          maxItems: 24,
          items: {
            type: 'object',
            additionalProperties: false,
            description: 'Exact edge object with only four scalar string fields: sourceNodeKey, sourcePortId, targetNodeKey and targetPortId. Do not add nested source/target objects or any other fields.',
            required: ['sourceNodeKey', 'sourcePortId', 'targetNodeKey', 'targetPortId'],
            properties: {
              sourceNodeKey: {
                type: 'string',
                pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$',
                maxLength: 48,
                description: 'A scalar string copied exactly from the source nodes[].key value; never an object or node id.',
              },
              sourcePortId: {
                type: 'string',
                minLength: 1,
                maxLength: 80,
                description: 'Exact scalar string ID of the source output port from node_catalog.',
              },
              targetNodeKey: {
                type: 'string',
                pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$',
                maxLength: 48,
                description: 'A scalar string copied exactly from the target nodes[].key value; never an object or node id.',
              },
              targetPortId: {
                type: 'string',
                minLength: 1,
                maxLength: 80,
                description: 'Exact scalar string ID of the target input port from node_catalog.',
              },
            },
          },
        },
        compositionBlueprints: compositionBlueprintsJsonSchema,
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
      'Prepare a validated update to the existing Image Production graph as soon as the user directly asks to change, add, implement or apply it; never ask for a separate textual confirmation.',
      'Use document_graph first and reference its real node and edge ids.',
      'The update may add nodes, update allowlisted settings, remove named edges and add replacement edges.',
      'By default update an ordinary editable canvas pipeline. Use textPrompt plus textConcat for locally editable parts; use pipelineInput fields only when the user explicitly requests an endpoint, API, SDK, MCP, external run or Executable Pipeline.',
      'For a functional QR code, add qrCode rather than generateImage. Connect an executable targetUrl field through field:target-url -> qrCode.text, then declare qrCode.image as the source of the QR image layer in compositionBlueprints.',
      'For editable Composition layouts, use top-level compositionBlueprints V1 instead of manually targeting layer-N. The product compiler resolves stable layer keys to real ports and validates sources before presenting the proposal.',
      'For qrCode V1, update only title, content or contentMode; do not send advanced rendering settings.',
      'Do not describe the full QR-to-Composition graph as runtime-ready until server Composition support is available and publication validation accepts it.',
      'A newly added importImage may use sourceAttachmentIndex 0..2 to reference the corresponding image from the latest user message with attachments.',
      'To replace textConcat with a template, configure textPrompt.variables as variable-0..variable-9, reference them as @Alias in settings.text, and connect sources to the matching variable-N input ports.',
      'The exact top-level fields are summary, nodes, updates, removeEdgeIds, edges, compositionBlueprints and optional layout; omit unchanged arrays and blueprints.',
      'This action never runs generation, publishes, exports or deletes nodes. It creates a read-only proposal and the graph changes only after the single UI confirmation.',
    ].join(' '),
    riskLevel: 'write',
    inputSchema: pipelineUpdateInputJsonSchema,
  },
];
