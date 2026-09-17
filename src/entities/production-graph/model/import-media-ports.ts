import type { GraphPort, ImportImageNodeData } from './types';

/** The legacy image/audio port id stays stable; video exposes its distinct tracks. */
export function getImportMediaPorts(data: ImportImageNodeData): GraphPort[] | undefined {
  if (data.mediaKind === 'video') return [
    { id: 'original', label: 'Original', kind: 'video', side: 'output' },
    { id: 'video', label: 'Video only', kind: 'video', side: 'output' },
    { id: 'audio', label: 'Audio', kind: 'audio', side: 'output' },
  ];
  if (data.mediaKind === 'audio') return [{ id: 'image', label: 'Audio', kind: 'audio', side: 'output' }];
  return undefined;
}
