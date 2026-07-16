'use client';

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || undefined,
});

export const { signIn, signUp, useSession } = authClient;

export async function signOut() {
  const result = await authClient.signOut();
  if (result.error) throw new Error('Unable to close the server session.');
  return result;
}
