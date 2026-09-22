import { createRouteErrorResponse } from '@prodactionpro/chat-runtime-next/server';
import { readAuthServerConfig } from '@/shared/auth/config';
import { convertHeicReference, HEIC_REFERENCE_MAX_BYTES } from '@/shared/media/heic-reference';
import { resolveChatPrincipal } from './auth';

export async function postConvertReference(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (!origin || !readAuthServerConfig().trustedOrigins.includes(origin)) return Response.json({ error: 'Обновите страницу.' }, { status: 403 });
    await resolveChatPrincipal(request);
    // Stream with a hard byte limit even when Content-Length is omitted.
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: 'Выберите HEIC файл.' }, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > HEIC_REFERENCE_MAX_BYTES) { await reader.cancel(); return Response.json({ error: 'Файл должен быть не больше 8 МБ.' }, { status: 413 }); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    try {
      const converted = await convertHeicReference(Buffer.concat(chunks), request.signal);
      return new Response(new Uint8Array(converted), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' } });
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Не удалось обработать изображение.' }, { status: 422 }); }
  } catch (error) { return createRouteErrorResponse(error); }
}
