import { DEFAULT_VIDEO_MODEL, VIDEO_REFERENCE_LIMIT } from '@/shared/media/video-generation-contracts';
import type { ProductionNodeDefinitionMap } from './node-registry-types';

export const videoNodeDefinitions = {
  generateVideo: {
    type: 'generateVideo', title: 'Generate Video', menuLabel: 'Generate video', collapsible: true, defaultHeight: 780,
    ports: [
      { id: 'prompt', label: 'Prompt', kind: 'text', side: 'input' },
      { id: 'first-frame', label: 'First frame', kind: 'image', side: 'input' },
      { id: 'last-frame', label: 'Last frame', kind: 'image', side: 'input' },
      ...Array.from({ length: VIDEO_REFERENCE_LIMIT }, (_, index) => ({
        id: `reference-${index + 1}`, label: `Reference ${index + 1}`, kind: 'image' as const, side: 'input' as const,
      })),
      { id: 'video', label: 'Video', kind: 'video', side: 'output' },
    ],
    createData: () => ({ title: 'Generate Video', model: DEFAULT_VIDEO_MODEL, mode: 'text', prompt: '',
      duration: 4, resolution: '720p', aspectRatio: '16:9', generateAudio: false,
      referenceDescriptions: ['', '', ''], resultAssetIds: [], activeResultIndex: 0 }),
  },
} satisfies ProductionNodeDefinitionMap<'generateVideo'>;
