import { createSpeechProviderCall, speechOptionsSchema } from '@/modules/provider-connections/server/speech-provider-call';
import { executeShortOpenRouterCall, shortAiScopeSchema, toShortAiApiErrorResponse } from './short-ai-execution';

export const runtime = 'nodejs';
const speechSchema = speechOptionsSchema.extend(shortAiScopeSchema.shape);

export async function POST(request: Request) {
  const parsed = speechSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const execution = await executeShortOpenRouterCall({
      ...createSpeechProviderCall(parsed.data, request.signal), request, scope: parsed.data,
    });
    const headers = new Headers({
      'Content-Type': execution.result.contentType, 'Cache-Control': 'no-store',
      'X-Generation-Job-Id': execution.job.id,
    });
    if (execution.result.generationId) headers.set('X-Generation-Id', execution.result.generationId);
    return new Response(new Uint8Array(execution.result.audioBody), { headers });
  } catch (error) { return toShortAiApiErrorResponse(error); }
}
