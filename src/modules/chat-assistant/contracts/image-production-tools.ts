import type { AgentToolDefinition } from '@prodactionpro/chat-connectors';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import { compositionBlueprintsJsonSchema } from './composition-blueprint-tool-schema';
import { createPipelineNodeSchema } from './pipeline-node-tool-schema';
import { pipelineUpdateInputJsonSchema } from './pipeline-update-tool-schema';
import { PIPELINE_AUTHORING_GUIDANCE } from './pipeline-authoring-guidance';
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
  audioConvert: ['title', 'format', 'bitrateKbps', 'sampleRateHz', 'channels'],
  cropImage: ['title', 'aspectRatio', 'crop'], curves: ['title'],
  exportImage: ['title', 'format', 'quality', 'scale', 'background'],
  frequencyRetouch: ['title'], generateImage: ['title', 'prompt', 'model', 'aspectRatio', 'size', 'imageQuality', 'imageBackground', 'imageFormat', 'imageCompression', 'imageSeed'],
  imageToText: ['title', 'model', 'analysisPreset', 'preset', 'presets', 'prompt'], importImage: ['title', 'videoAudioTrackIndex'], iterator: ['title'],
  pipelineInput: ['title', 'fields'], pipelineOutput: ['title', 'fields'],
  locationBuilder: ['title'], preview: ['title'],
  qrCode: ['title', 'content', 'contentMode'],
  referenceComposer: ['title', 'prompt', 'aspectRatio', 'size'],
  refineImage: ['title', 'instruction', 'size'], removeBackground: ['title'], router: ['title'],
  sketch: ['title', 'aspectRatio'], subjectBuilder: ['title'], telegramPublication: ['title'],
  textConcat: ['title', 'separator', 'customSeparator', 'prefix', 'suffix'],
  textFormatter: ['title', 'presetId'],
  textGeneration: ['title', 'instruction', 'outputStyle', 'reasoning', 'temperature'],
  textPrompt: ['title', 'text', 'variables', 'variableDisplayMode', 'presentation'],
  textSplitter: ['title', 'delimiter'],
  textToSpeech: ['title', 'localText', 'model', 'language', 'voice', 'responseFormat', 'speed'],
  speechToText: ['title', 'model', 'language'],
  timelineHandoff: ['title', 'model', 'language', 'threshold', 'outputScope', 'activeShotIndex'],
  reverieStories: ['title', 'storyMode', 'storyTitle', 'subtitle', 'text', 'locale', 'styleProfileId', 'styleRevisionId'],
  generateVideo: ['title', 'model', 'mode', 'prompt', 'duration', 'resolution', 'aspectRatio', 'generateAudio', 'seed', 'referenceDescriptions'],
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
      PIPELINE_AUTHORING_GUIDANCE,
      'Set documentName to a concise task-oriented name instead of Untitled Pipeline.',
      'By default build an ordinary editable canvas pipeline and represent user-editable text such as notes or briefs with textPrompt. Add pipelineInput/pipelineOutput or executable semantics only when the user explicitly requests an endpoint, API, SDK, MCP, external run or Executable Pipeline.',
      'In an ordinary canvas request, phrases such as separate input, prompt input or editable input mean a separate textPrompt node, not pipelineInput.',
      'For an executable free-form text field that must be embedded into stable prompt instructions, declare the pipelineInput field, add a textPrompt variable-N whose alias equals the public field key, place @Alias in textPrompt.settings.text, connect field:<id> to variable-N, then connect textPrompt.text to the consumer. Connect field:<id> directly to a text input only when the external value is the complete input.',
      'When an image result needs export conversion before it becomes public, connect the producer image to exportImage.image-0 and connect exportImage.image to the image field on pipelineOutput. Do not bypass Export with the unconverted producer image.',
      'For audio use speechToText.audio -> speechToText.text, textToSpeech.text -> textToSpeech.audio, and audioConvert.source -> audioConvert.audio. Audio convert formats are mp3/wav/flac/ogg (Opus), never image Export. Declare kind audio on executable Input/Output fields; these values reference managed private Workspace assets, not URLs or base64.',
      'Extract imageToText: analysisPreset is composition (default), graphics, character or location. Layers are presets (array) or legacy preset (single); default means every layer of the chosen profile. Read node_catalog for the exact layer keys. The product builds its own prompt for the selected preset/layers; omit prompt unless the user requests custom instructions. A profile switch saves the current prompt/layers and restores the selected profile draft. An explicit Layers change rebuilds its prompt. Changing settings does not run paid analysis.',
      'Import has technical type importImage. Image/audio files keep output id image with file-detected kind. Video exposes original (video with audio), video (silent video), audio (selected audio track). Read document_graph after upload; do not force mediaKind, forge asset ids or use sourceAttachmentIndex for audio/video. videoAudioTrackIndex must be an existing stream index. Import has no input port; video.import prepares only connected outputs in explicit runtime.',
      'Timeline Handoff: importImage.original -> timelineHandoff.video, then timelineHandoff.timeline -> Pipeline Output kind json. Analyze with FFmpeg first, let the user adjust cuts and select 1-5 stills per shot, then explicitly describe current/all shots in at most 500 Unicode characters each. Limits: 5 minutes, 100 shots. No scene grouping, physical clips, detail presets or direct video AI. Runtime exports only a reviewed pinned snapshot matching the source video; it does not analyze a new video unattended. Never fabricate analysis/assets or trigger paid descriptions from an ordinary graph-edit request.',
      'Voice accepts up to 30000 characters / 30 minutes. Over 5000 characters is a durable server split-and-join operation returning one MP3; each part is paid. It preserves source words/order, does not clone a voice, and does not turn a blog into a subscription product. Resume the same request after failures; do not invent a new paid request silently.',
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
      PIPELINE_AUTHORING_GUIDANCE,
      'The update may add nodes, update allowlisted settings, remove named edges and add replacement edges.',
      'By default update an ordinary editable canvas pipeline. Use textPrompt plus textConcat for locally editable parts; use pipelineInput fields only when the user explicitly requests an endpoint, API, SDK, MCP, external run or Executable Pipeline.',
      'When external text must be embedded into fixed instructions, map pipelineInput.field:<id> to a textPrompt variable-N named with the public field key, reference @Alias in settings.text, and continue from textPrompt.text. A direct field-to-text connection means the external value is the whole input.',
      'For a public converted image artifact, route the source through exportImage.image-0 and connect the new exportImage.image output to pipelineOutput. Preserve existing format, quality, scale and background settings unless the user changes them.',
      'For audio connect speechToText.audio or audioConvert.source; speechToText.text returns text. Voice/audioConvert output audio to kind audio Pipeline output. Import image/audio mode uses importImage.image; video mode uses original/video as video and audio as selected soundtrack. Export image is not an audio/video converter. Declare kind video for video Output. sourceAttachmentIndex remains image-only. Import video does not separate speech from background music.',
      'Timeline Handoff connects importImage.original -> timelineHandoff.video and emits the full reviewed timeline from timelineHandoff.timeline as json. Configure only title/model/language/threshold (1..60). After cuts and selected stills are reviewed, the user separately requests brief descriptions up to 500 characters. Do not author analysis, source/frame asset ids, groups or clip files; changing graph settings is not permission for paid description calls. Runtime uses the reviewed snapshot, never unattended analysis of a new video.',
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
