import { createHash } from 'node:crypto';
import { assembleSpeechParts } from '@/shared/media/speech-assembly';
import { MAX_SPEECH_EXECUTION_MILLISECONDS, MAX_SPEECH_REQUEST_CHARACTERS, SPEECH_CHUNKING_VERSION, splitSpeechText } from '@/shared/media/speech-text';
import { createSpeechProviderCall, longSpeechOptionsSchema, type SpeechOptions, type SpeechResult } from '@/modules/provider-connections/server/speech-provider-call';
import { executeInternalOpenRouterCall } from './internal-short-ai-execution';
import type { ShortAiScope } from './short-ai-execution-contracts';

export interface SpeechGenerationInput {
  actorUserId: string;
  options: SpeechOptions;
  scope: ShortAiScope & { idempotencyKey: string };
  signal: AbortSignal;
  /** Lease/cancellation check, including before every paid part. */
  assertActive?(): Promise<void>;
}
export type SpeechChunkExecutor = (input: Parameters<typeof executeInternalOpenRouterCall<SpeechResult, SpeechResult>>[0]) => Promise<{ job: { id: string }; result: SpeechResult }>;

/** Whole text is never sent as an instruction to rewrite/summarize. Every provider
 * part has an immutable, versioned checkpoint key and its own usage attribution. */
export async function generateSpeech(input: SpeechGenerationInput, dependencies = {
  execute: executeInternalOpenRouterCall as SpeechChunkExecutor,
  assemble: assembleSpeechParts,
}) {
  const options = longSpeechOptionsSchema.parse(input.options);
  const long = options.inputText.length > MAX_SPEECH_REQUEST_CHARACTERS;
  const signal = long ? AbortSignal.any([input.signal, AbortSignal.timeout(MAX_SPEECH_EXECUTION_MILLISECONDS)]) : input.signal;
  const chunks = splitSpeechText(options.inputText).filter((chunk) => chunk.text.trim());
  // Validate every provider part before the first paid dispatch (including model-specific minimums).
  for (const chunk of chunks) createSpeechProviderCall({ ...options, inputText: chunk.text }, signal);
  const fingerprint = createHash('sha256').update(JSON.stringify([SPEECH_CHUNKING_VERSION, options])).digest('hex');
  const requestKey = createHash('sha256').update(input.scope.idempotencyKey).update(fingerprint).digest('hex');
  let lastJobId = '';
  const executeChunk = async (index: number) => {
    signal.throwIfAborted();
    await input.assertActive?.();
    const chunk = chunks[index]!;
    const result = await dependencies.execute({
      ...createSpeechProviderCall({ ...options, inputText: chunk.text }, signal),
      actorUserId: input.actorUserId,
      request: new Request('http://generation.internal/speech', { signal }),
      scope: {
        ...input.scope,
        idempotencyKey: long ? `tts:${requestKey}:${index}` : input.scope.idempotencyKey,
        metadata: !long ? input.scope.metadata : {
          ...input.scope.metadata, speechChunkIndex: index, speechChunkCount: chunks.length,
          speechChunkingVersion: SPEECH_CHUNKING_VERSION, speechSourceStart: chunk.startOffset,
          speechSourceEnd: chunk.endOffset, speechRequestHash: fingerprint,
        },
      },
    });
    signal.throwIfAborted();
    await input.assertActive?.();
    lastJobId = result.job.id;
    return result;
  };
  if (!long) return { ...await executeChunk(0), chunkCount: 1 };
  const parts = async function* () {
    for (let index = 0; index < chunks.length; index += 1) yield (await executeChunk(index)).result.audioBody;
  };
  const assembled = await dependencies.assemble({ parts: parts(), signal });
  signal.throwIfAborted();
  await input.assertActive?.();
  return { job: { id: lastJobId }, chunkCount: chunks.length,
    result: { audioBody: assembled.bytes, contentType: assembled.contentType, generationId: null } satisfies SpeechResult };
}
