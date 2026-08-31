import type { PipelineTemplateExport } from './project-schema';
import type {
  GraphEdge,
  ProductionNode,
  ProductionNodeData,
  ProductionNodeType,
} from './types';
import { getPipelineSemanticContractPreset } from './pipeline-semantic-contract-presets';

export type SystemPipelinePresetKey = 'story.asset.render.v1' | 'story.slide.preview.v1';

export interface SystemPipelinePreset {
  description: string;
  executable: boolean;
  key: SystemPipelinePresetKey;
  label: string;
  template: PipelineTemplateExport;
}

const requestPreset = requiredContractPreset('story.production.request.v1');
const resultPreset = requiredContractPreset('story.production.result.v1');

const STORY_RENDER_NODES = [
  node('story-input', 'pipelineInput', 120, 180, 400, 650, {
    title: 'Story Production Input',
    fields: requestPreset.fields,
    semanticContract: requestPreset.semanticContract,
  }),
  node('story-prompt', 'textGeneration', 620, 180, 400, 757, {
    title: 'Prepare visual prompt',
    model: 'google/gemini-2.5-flash',
    instruction: [
      'Turn the connected brief into a concise production-ready prompt for one vertical Stories background.',
      'Preserve the meaning, avoid logos and personal data, and do not render interface controls or text in the image.',
      'Return only the image prompt.',
    ].join(' '),
    outputStyle: 'plain',
    reasoning: 'low',
    temperature: 0.7,
  }),
  node('story-generate', 'generateImage', 1120, 180, 400, 720, {
    title: 'Generate story background',
    model: 'google/gemini-2.5-flash-image',
    aspectRatio: '9:16',
    size: '1K',
    prompt: '',
    activeResultIndex: -1,
    resultAssetIds: [],
  }),
  node('story-output', 'pipelineOutput', 1620, 180, 400, 280, {
    title: 'Story Production Output',
    fields: resultPreset.fields,
    semanticContract: resultPreset.semanticContract,
  }),
] satisfies ProductionNode[];

const STORY_RENDER_EDGES = [
  edge('story-brief-to-prompt', 'story-input', 'field:story-request-brief', 'story-prompt', 'text'),
  edge('story-prompt-to-image', 'story-prompt', 'result', 'story-generate', 'prompt'),
  edge('story-image-to-output', 'story-generate', 'image', 'story-output', 'field:story-result-background'),
] satisfies GraphEdge[];

const PRESETS: readonly SystemPipelinePreset[] = [{
  key: 'story.asset.render.v1',
  label: 'Story asset render · executable',
  description: 'Один фон одного слайда за один durable run.',
  executable: true,
  template: template(
    'story-render-section',
    'story.asset.render.v1 · executable',
    'story.asset.render.v1',
    STORY_RENDER_NODES,
    STORY_RENDER_EDGES,
  ),
}, {
  key: 'story.slide.preview.v1',
  label: 'Story slide preview · authoring',
  description: 'Локальная сборка и preview 1080×1920; серверный Composition появится отдельным этапом.',
  executable: false,
  template: template(
    'story-preview-section',
    'Story slide preview · authoring only',
    'story.slide.preview.v1',
    [
      ...STORY_RENDER_NODES.filter((candidate) => candidate.id !== 'story-output'),
      node('story-composition', 'composition', 1620, 180, 400, 560, {
        title: 'Story Composition · 1080×1920',
        aspectRatio: '9:16',
        canvasWidth: 1080,
        canvasHeight: 1920,
        layerInputCount: 2,
        layers: [],
        size: '1K',
      }),
      node('story-output', 'pipelineOutput', 2120, 180, 400, 280, {
        title: 'Story Production Output',
        fields: resultPreset.fields,
        semanticContract: resultPreset.semanticContract,
      }),
    ],
    [
      ...STORY_RENDER_EDGES.filter((candidate) => candidate.id !== 'story-image-to-output'),
      edge('story-image-to-composition', 'story-generate', 'image', 'story-composition', 'layer-0'),
      edge('story-composition-to-output', 'story-composition', 'image', 'story-output', 'field:story-result-background'),
    ],
    2720,
  ),
}] as const;

export function getSystemPipelinePresets(): SystemPipelinePreset[] {
  return structuredClone([...PRESETS]);
}

export function getSystemPipelinePreset(key: SystemPipelinePresetKey) {
  const preset = PRESETS.find((candidate) => candidate.key === key);
  return preset ? structuredClone(preset) : undefined;
}

function requiredContractPreset(contractKey: string) {
  const preset = getPipelineSemanticContractPreset(contractKey);
  if (!preset) throw new Error(`Required semantic contract preset "${contractKey}" is missing.`);
  return preset;
}

function node(
  id: string,
  type: ProductionNodeType,
  x: number,
  y: number,
  width: number,
  height: number,
  data: ProductionNodeData,
): ProductionNode {
  return {
    id,
    type,
    position: { x, y },
    size: { width, height },
    status: 'idle',
    data,
  };
}

function edge(
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
): GraphEdge {
  return { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId };
}

function template(
  sectionId: string,
  sectionTitle: string,
  capabilityKey: SystemPipelinePresetKey,
  nodes: ProductionNode[],
  edges: GraphEdge[],
  sectionWidth = 2220,
): PipelineTemplateExport {
  const project = {
    version: 1 as const,
    nodes,
    sections: [{
      capabilityKey,
      id: sectionId,
      title: sectionTitle,
      position: { x: 0, y: 0 },
      size: { width: sectionWidth, height: 1120 },
    }],
    edges,
    assets: [] as [],
    presets: [],
    subjects: [],
    locations: [],
    publications: [],
    runs: [] as [],
    selectedNodeIds: [],
    selectedSectionIds: [],
  };
  return {
    kind: 'pipelineTemplate',
    schemaVersion: 1,
    exportedAt: '2026-08-31T00:00:00.000Z',
    project,
    uiState: {
      viewport: { x: 0, y: 0, zoom: 0.72 },
      nodes: {},
      sections: {},
    },
    assetsManifest: [],
  };
}
