import { DEFAULT_TIMELINE_MODEL } from '@/shared/api/timeline-models';
import type { ProductionNodeDefinitionMap } from './node-registry-types';

export const timelineNodeDefinitions = {
  timelineHandoff: {
    type: 'timelineHandoff', title: 'Timeline Handoff', menuLabel: 'Timeline handoff',
    collapsible: true, defaultHeight: 640,
    ports: [
      { id: 'video', label: 'Video', kind: 'video', side: 'input' },
      { id: 'timeline', label: 'Timeline', kind: 'json', side: 'output' },
      { id: 'videoResult', label: 'Fragments', kind: 'video', side: 'output' },
      { id: 'frames', label: 'Frames', kind: 'image', side: 'output' },
      { id: 'descriptions', label: 'Descriptions', kind: 'text', side: 'output' },
    ],
    createData: () => ({ title: 'Timeline Handoff', model: DEFAULT_TIMELINE_MODEL, threshold: 10, activeShotIndex: 0, previewMode: 'video', outputScope: 'selected' }),
  },
} satisfies ProductionNodeDefinitionMap<'timelineHandoff'>;
