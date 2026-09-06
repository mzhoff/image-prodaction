import { z } from 'zod';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';
import { RuntimeCostError } from '../core/runtime-cost-policy';
import { PipelineDomainError } from '../contracts/pipeline-errors';
import { isRuntimeProtocolConflict } from './runtime-protocol-conflict';

export function runtimeJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}

export function runtimeError(error: unknown) {
  let code = 'runtime_unavailable';
  let message = 'Runtime is temporarily unavailable.';
  let status = 503;
  if (error instanceof RuntimeV2Error) ({ code, message, status } = error);
  else if (isRuntimeProtocolConflict(error)) { code = 'idempotency_protocol_conflict'; message = 'This operation belongs to another runtime protocol. Continue it through its original connection.'; status = 409; }
  else if (error instanceof RuntimeCostError) { code = error.code; message = error.message; status = 422; }
  else if (error instanceof z.ZodError) { code = 'invalid_request'; message = 'Request does not match the runtime contract.'; status = 400; }
  else if (error instanceof PipelineDomainError) { code = 'invalid_input'; message = 'Input does not match the published pipeline contract.'; status = 422; }
  const response = runtimeJson({ error: { code, message } }, status);
  if (status === 401) response.headers.set('WWW-Authenticate', 'Bearer realm="runtime-v2"');
  // Do not log request/body, provider exceptions or database errors: they may
  // contain tokens, prompt content or cross-tenant parameters.
  return response;
}

export function runtimeId(value: string) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new RuntimeV2Error('not_found', 'Resource was not found.', 404);
  return parsed.data;
}

export function runtimeVersionNumber(value: string) {
  const version = Number(value);
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(version)) throw new RuntimeV2Error('invalid_request', 'A positive published version number is required.', 400);
  return version;
}

export function runtimeIdempotencyKey(request: Request) {
  const value = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!value || value.length > 255 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new RuntimeV2Error('invalid_idempotency_key', 'A valid Idempotency-Key header is required.', 400);
  }
  return value;
}

export async function readRuntimeBody(request: Request, maxBytes = 262_144): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
    throw new RuntimeV2Error('invalid_request', 'An application/json body is required.', 415);
  }
  if (Number(request.headers.get('content-length')) > maxBytes) {
    throw new RuntimeV2Error('request_too_large', 'Request body is too large.', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RuntimeV2Error('invalid_request', 'A JSON body is required.', 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new RuntimeV2Error('request_too_large', 'Request body is too large.', 413); }
      chunks.push(chunk.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new RuntimeV2Error('invalid_request', 'A valid JSON body is required.', 400); }
  } finally { reader.releaseLock(); }
}
