import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/shared/auth/server';

export async function requirePageSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user.id) {
    redirect('/login');
  }

  return session;
}
