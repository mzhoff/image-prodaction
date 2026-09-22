import { resolveChatPrincipal } from './auth';
import { readAuthServerConfig } from '@/shared/auth/config';
import { readBoundedJsonObject } from '@/shared/api/read-bounded-json';
import { createRouteErrorResponse } from '@prodactionpro/chat-runtime-next/server';
import { createHomeTextSettings } from './home-text-settings-service';

export async function postHomeTextSettingsRoute(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || !readAuthServerConfig().trustedOrigins.includes(origin)) return Response.json({ error: { message: 'Обновите страницу.' } }, { status: 403 });
  try {
    return Response.json(await createHomeTextSettings(await resolveChatPrincipal(request), await readBoundedJsonObject(request, 2048)),
      { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return createRouteErrorResponse(error); }
}
