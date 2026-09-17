import { createSpeechProviderCall, longSpeechOptionsSchema, type SpeechResult } from '@/modules/provider-connections/server/speech-provider-call';
import type { submitLongSpeech } from '@/modules/generation/server/speech-generation-submission';
import type { executeShortOpenRouterCallCore } from '@/modules/generation/server/short-ai-execution-core';
import { shortAiScopeSchema } from '@/modules/generation/server/short-ai-scope';
import { MAX_SPEECH_REQUEST_CHARACTERS } from '@/shared/media/speech-text';
import { readBoundedBytes } from '@/shared/media/bounded-bytes';

const speechSchema = longSpeechOptionsSchema.extend(shortAiScopeSchema.shape);
export interface SpeechRouteDependencies {
  userId(request: Request): Promise<string>;
  authorizeProvider(userId: string, workspaceId: string): Promise<void>;
  submit: typeof submitLongSpeech;
  execute(input: Parameters<typeof executeShortOpenRouterCallCore<SpeechResult, SpeechResult>>[0]): ReturnType<typeof executeShortOpenRouterCallCore<SpeechResult, SpeechResult>>;
  toErrorResponse(error: unknown): Response;
}

/** Pure HTTP boundary; auth, credentials and submission are supplied by the Next adapter. */
export function createGenerateSpeechPost(dependencies: SpeechRouteDependencies) {
  return async function postGenerateSpeech(request: Request) {
    if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      return Response.json({ error: 'Speech requests must use application/json.' }, { status: 415 });
    }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(await readBoundedBytes(new Response(request.body, { headers: request.headers }), 256 * 1024, request.signal))); }
    catch { return Response.json({ error: 'Speech request is invalid or too large.' }, { status: 400 }); }
    const parsed = speechSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    try {
      if (parsed.data.inputText.length > MAX_SPEECH_REQUEST_CHARACTERS) {
        if (!parsed.data.documentId || !parsed.data.idempotencyKey) return Response.json({ error: 'Long speech requires a saved project and an idempotency key.' }, { status: 400 });
        const userId = await dependencies.userId(request);
        await dependencies.authorizeProvider(userId, parsed.data.workspaceId);
        const result = await dependencies.submit({ ...parsed.data, documentId: parsed.data.documentId,
          idempotencyKey: parsed.data.idempotencyKey, options: parsed.data, userId });
        const pending = result.job.status === 'queued' || result.job.status === 'running'
          || (result.job.status === 'failed' && result.job.error?.retryable === true);
        return Response.json(result, { status: pending ? 202 : 200,
          headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '1' } });
      }
      const execution = await dependencies.execute({ ...createSpeechProviderCall(parsed.data, request.signal), request, scope: parsed.data });
      const headers = new Headers({ 'Content-Type': execution.result.contentType, 'Cache-Control': 'no-store', 'X-Generation-Job-Id': execution.job.id });
      if (execution.result.generationId) headers.set('X-Generation-Id', execution.result.generationId);
      return new Response(new Uint8Array(execution.result.audioBody), { headers });
    } catch (error) { return dependencies.toErrorResponse(error); }
  };
}
