import { getAuth } from './server';

type AuthHandler = (request: Request) => Promise<Response>;

export async function handleAuthRequest(request: Request) {
  return handleAuthRequestSafely(request, async (nextRequest) => (await getAuth()).handler(nextRequest));
}

export async function handleAuthRequestSafely(
  request: Request,
  handler: AuthHandler,
  reportFailure: () => void = reportAuthFailure,
) {
  try {
    return await handler(request);
  } catch {
    reportFailure();
    return Response.json({
      error: {
        code: 'auth_unavailable',
        message: 'Authentication service is temporarily unavailable.',
      },
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

function reportAuthFailure() {
  console.error('[auth] Unhandled authentication request failure.');
}
