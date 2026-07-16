import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from './server';
import { ensurePersonalWorkspaceForUser } from './workspace-bootstrap';

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthenticationRequiredError';
  }
}

export async function getRequestSession(request?: Request) {
  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: request?.headers ?? await headers(),
  });
  if (session?.user.id) await ensurePersonalWorkspaceForUser(session.user);
  return session;
}

export async function requireApiSession(request?: Request) {
  const session = await getRequestSession(request);
  if (!session?.user.id) throw new AuthenticationRequiredError();
  return session;
}

export async function requirePageSession() {
  const session = await getRequestSession();
  if (!session?.user.id) redirect('/login');
  return session;
}
