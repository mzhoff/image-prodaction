import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { resolveOpenRouterCredential } from '@/modules/provider-connections/server/provider-connection-service';
import { submitLongSpeech } from '@/modules/generation/server/speech-generation-submission';
import { executeShortOpenRouterCall, toShortAiApiErrorResponse } from './short-ai-execution';
import { createGenerateSpeechPost } from './generate-speech-handler';

export const runtime = 'nodejs';
export const POST = createGenerateSpeechPost({
  userId: async (request) => (await requireApiSession(request)).user.id,
  authorizeProvider: async (userId, workspaceId) => { await resolveOpenRouterCredential(userId, workspaceId); },
  submit: submitLongSpeech, execute: executeShortOpenRouterCall,
  toErrorResponse: toShortAiApiErrorResponse,
});
