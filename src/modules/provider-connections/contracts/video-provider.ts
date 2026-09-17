import type { VideoGenerationRequest } from '@/shared/media/video-generation-contracts';
import type { ProviderUsage } from './provider-contracts';

export interface VideoProviderInput extends Omit<VideoGenerationRequest, 'firstFrame' | 'lastFrame' | 'references'> {
  firstFrame?: string; lastFrame?: string;
  references: Array<{ slot: number; url: string; description: string }>;
}
export interface VideoProviderStatus {
  operationId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';
  generationId?: string;
  failure?: VideoProviderDiagnostic;
  usage: ProviderUsage;
}
/** Bounded, sanitized provider evidence. Never includes credentials, prompts or image bytes. */
export interface VideoProviderDiagnostic {
  code: string;
  message: string;
  httpStatus: number | null;
  providerCode?: string;
  requestId?: string;
  detail?: string;
}
export interface VideoProviderAdapter {
  submit(input: VideoProviderInput, context: VideoProviderContext): Promise<VideoProviderStatus>;
  poll(operationId: string, context: VideoProviderContext): Promise<VideoProviderStatus>;
  download(operationId: string, context: VideoProviderContext): Promise<Uint8Array>;
}
export interface VideoProviderContext { credential: string; signal: AbortSignal; redactions?: string[] }
