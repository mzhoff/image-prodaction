import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from './server';

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthenticationRequiredError';
  }
}

export async function getRequestSession(request?: Request) {
  const auth = await getAuth();
  return auth.api.getSession({
    headers: request?.headers ?? await headers(),
  });
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
