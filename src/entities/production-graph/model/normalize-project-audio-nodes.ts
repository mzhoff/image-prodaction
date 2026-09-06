import { audioConvertOptionsSchema } from '@/shared/media/audio-contracts';
import { normalizeNodeSize } from './node-layout';
import type { AudioConvertNodeData, ProductionNode, SpeechToTextNodeData } from './types';

export function normalizeAudioNode(node: ProductionNode): ProductionNode | null {
  if (node.type === 'speechToText') {
    const data = node.data as SpeechToTextNodeData;
    return { ...node, size: normalizeNodeSize(node.type, node.size), data: {
      ...data, title: data.title || 'Transcribe',
      model: typeof data.model === 'string' && data.model.trim() ? data.model : 'google/gemini-3.1-flash-lite',
      language: typeof data.language === 'string' && data.language !== 'auto' ? data.language.slice(0, 80) : undefined,
      result: typeof data.result === 'string' ? data.result : '',
    } };
  }
  if (node.type !== 'audioConvert') return null;
  const data = node.data as AudioConvertNodeData;
  const format = audioConvertOptionsSchema.shape.format.safeParse(data.format);
  return { ...node, size: normalizeNodeSize(node.type, node.size), data: {
    ...data, title: data.title || 'Audio Convert', format: format.success ? format.data : 'mp3',
    bitrateKbps: audioConvertOptionsSchema.shape.bitrateKbps.safeParse(data.bitrateKbps).data,
    sampleRateHz: audioConvertOptionsSchema.shape.sampleRateHz.safeParse(data.sampleRateHz).data,
    channels: audioConvertOptionsSchema.shape.channels.safeParse(data.channels).data,
  } };
}
