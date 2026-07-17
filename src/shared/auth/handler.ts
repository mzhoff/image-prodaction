import { getAuth } from './server';

type AuthHandler = (request: Request) => Promise<Response>;

export async function handleAuthRequest(request: Request) {
  return handleAuthRequestSafely(request, async (nextRequest) => (await getAuth()).handler(nextRequest));
}

export async function handleAuthRequestSafely(
  request: Request,
  handler: AuthHandler,
  reportFailure: (error: unknown) => void = reportAuthFailure,
) {
  try {
    return await handler(request);
  } catch (error) {
    reportFailure(error);
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

function reportAuthFailure(error: unknown) {
  console.error('[auth] Unhandled authentication request failure.', {
    errors: getSafeErrorChain(error),
  });
}

function getSafeErrorChain(error: unknown) {
  const chain: Array<{ code: string | null; message: string | null; name: string }> = [];
  let current: unknown = error;
  while (current && chain.length < 4) {
    const record = typeof current === 'object'
      ? current as { cause?: unknown; code?: unknown; message?: unknown; name?: unknown }
      : null;
    chain.push({
      code: typeof record?.code === 'string' ? record.code.slice(0, 40) : null,
      message: typeof record?.message === 'string'
        ? sanitizeErrorMessage(record.message)
        : null,
      name: typeof record?.name === 'string' ? record.name.slice(0, 80) : 'UnknownError',
    });
    current = record?.cause;
  }
  return chain;
}

function sanitizeErrorMessage(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/\s+/g, ' ')
    .slice(0, 240);
}
