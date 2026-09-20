import { z } from 'zod';
import { validPlatformSignature } from '@/modules/provider-connections/server/platform/request-auth';
import { ownedBudgetWorkspaces } from '@/modules/provider-connections/server/platform/owned-workspaces';

const payload = z.object({ issuer: z.string().url(), subject: z.string().min(1).max(200) }).strict();
export async function handleBudgetWorkspaces(request: Request) {
  const reply = (status: number, code: string) =>
    Response.json({ code }, { status, headers: { 'Cache-Control': 'no-store' } });
  const secret = process.env.PLATFORM_PROJECTION_SECRET?.trim();
  const issuer = process.env.REVERIE_IDENTITY_ISSUER?.trim();
  if (!secret || !issuer) return reply(503, 'PLATFORM_NOT_CONFIGURED');
  const reader = request.body?.getReader();
  if (!reader) return reply(400, 'INVALID_REQUEST');
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return reply(413, 'REQUEST_TOO_LARGE');
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    if (
      !validPlatformSignature({
        body,
        secret,
        path: '/v1/platform/budget-workspaces',
        timestamp: request.headers.get('x-platform-timestamp'),
        signature: request.headers.get('x-platform-signature'),
      })
    )
      return reply(403, 'INVALID_SIGNATURE');
    let parsed: ReturnType<typeof payload.safeParse>;
    try {
      parsed = payload.safeParse(JSON.parse(body));
    } catch {
      return reply(400, 'INVALID_REQUEST');
    }
    if (!parsed.success || parsed.data.issuer !== issuer) return reply(400, 'INVALID_IDENTITY');
    return Response.json(
      { workspaces: await ownedBudgetWorkspaces(issuer, parsed.data.subject) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return reply(503, 'WORKSPACE_LOOKUP_UNAVAILABLE');
  }
}
