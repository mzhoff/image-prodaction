import type { AudioConvertOptions } from '@/shared/media/audio-contracts';
import type { BaseNodeData } from './node-data-image';

export interface SpeechToTextNodeData extends BaseNodeData {
  model: string;
  language?: string;
  result: string;
  audioAssetId?: string;
  lastRequest?: { idempotencyKey: string; fingerprint: string };
  message?: string;
}

export interface AudioConvertNodeData extends BaseNodeData, AudioConvertOptions {
  audioAssetId?: string;
  audioResultSignature?: string;
  sourceAudioAssetId?: string;
  message?: string;
}
