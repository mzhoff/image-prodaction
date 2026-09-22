import { readAuthServerConfig } from '@/shared/auth/config';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { user } from '@/shared/db/schema/auth';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';

export class TelegramHandoffError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
export async function requestTelegramHandoff(userId: string, input: { requestId: string; workspaceId: string; plan: string; amountUsd: number; analyticsContext?: { clientId: string } }) {
  await requireWorkspaceMembership(userId, input.workspaceId, ['owner']);
  const issuer = process.env.REVERIE_IDENTITY_ISSUER?.trim();
  const secret = process.env.PLATFORM_PROJECTION_SECRET?.trim();
  if (!issuer || !secret || secret.length < 32) throw new TelegramHandoffError('HANDOFF_UNAVAILABLE', 503);
  const [account] = await getDb().select({ subject: user.identitySubject }).from(user).where(eq(user.id, userId)).limit(1);
  if (!account?.subject?.startsWith(`${issuer}#`)) throw new TelegramHandoffError('IDENTITY_LINK_REQUIRED');
  const path = '/v1/platform/budget-handoffs', target = new URL(path, issuer);
  if (process.env.REVERIE_IDENTITY_DOCKER_HOST === 'true' && process.env.REVERIE_IDENTITY_LOCAL_DEVELOPMENT === 'true' && target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname)) target.hostname = 'host.docker.internal';
  const body = JSON.stringify({ version: 'budget.handoff.v1', ...input, analyticsContext: input.analyticsContext ? { ...input.analyticsContext, origin: new URL(readAuthServerConfig().baseURL).origin } : undefined, issuer, subject: account.subject.slice(issuer.length + 1) });
  const stamp = String(Date.now());
  const signature = createHmac('sha256', secret).update(`${stamp}\nPOST\n${path}\n${body}`).digest('hex');
  const response = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json', 'x-platform-timestamp': stamp, 'x-platform-signature': signature }, body, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new TelegramHandoffError(typeof result?.code === 'string' ? result.code : 'HANDOFF_UNAVAILABLE', response.status === 403 ? 403 : response.status === 409 ? 409 : 503);
  if (typeof result?.telegramUrl !== 'string' || !/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}\?start=topup_[a-f0-9-]{36}_[A-Za-z0-9_-]{18}$/.test(result.telegramUrl)) throw new TelegramHandoffError('HANDOFF_UNAVAILABLE', 503);
  return { telegramUrl: result.telegramUrl as string, id: result.id as string };
}
