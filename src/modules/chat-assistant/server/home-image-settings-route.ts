import { resolveChatPrincipal } from './auth';
import { readAuthServerConfig } from '@/shared/auth/config';
import { readBoundedJsonObject } from '@/shared/api/read-bounded-json';
import { createRouteErrorResponse } from '@prodactionpro/chat-runtime-next/server';
import { createHomeImageSettings } from './home-image-settings-service';
import { readHomeImagePreviews } from './home-image-previews';

export async function getHomeImageSettingsRoute(request: Request) {
  try {
    const principal = await resolveChatPrincipal(request);
    const query = new URL(request.url).searchParams;
    const previews = await readHomeImagePreviews(principal, {
      conversationId: query.get('conversationId'), settingsIds: query.getAll('settingsId'),
    });
    return Response.json(previews, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return createRouteErrorResponse(error); }
}

export async function postHomeImageSettingsRoute(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || !readAuthServerConfig().trustedOrigins.includes(origin)) {
    return Response.json({ error: { message: 'Обновите страницу и попробуйте снова.' } }, { status: 403 });
  }
  try {
    const principal = await resolveChatPrincipal(request);
    const body = await readBoundedJsonObject(request, 8_192);
    return Response.json(await createHomeImageSettings(principal, body), { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return createRouteErrorResponse(error); }
}
