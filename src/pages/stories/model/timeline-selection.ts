export type TimelineSelection = { kind: 'video' | 'audio' | 'grid' | 'track' | 'videoTrack'; id: string } | null;
export type ClipMenuTarget = { kind: 'audio' | 'video'; id: string; x: number; y: number };
export const timeLabel = (ms: number) => `${Math.floor(ms / 60_000).toString().padStart(2, '0')}:${((ms % 60_000) / 1000).toFixed(1).padStart(4, '0')}`;
