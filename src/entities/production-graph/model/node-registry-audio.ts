import type { ProductionNodeDefinitionMap } from './node-registry-types';

export const audioNodeDefinitions = {
  speechToText: {
    type: 'speechToText', title: 'Transcribe', menuLabel: 'Speech to text',
    collapsible: true, defaultHeight: 420,
    ports: [
      { id: 'audio', label: 'Audio', kind: 'audio', side: 'input' },
      { id: 'text', label: 'Text', kind: 'text', side: 'output' },
    ],
    createData: () => ({ title: 'Transcribe', model: 'google/gemini-3.1-flash-lite', result: '' }),
  },
  audioConvert: {
    type: 'audioConvert', title: 'Audio Convert', menuLabel: 'Audio convert',
    collapsible: true, defaultHeight: 420,
    ports: [
      { id: 'source', label: 'Audio', kind: 'audio', side: 'input' },
      { id: 'audio', label: 'Audio', kind: 'audio', side: 'output' },
    ],
    createData: () => ({ title: 'Audio Convert', format: 'mp3', bitrateKbps: 192 }),
  },
} satisfies ProductionNodeDefinitionMap<'speechToText' | 'audioConvert'>;
