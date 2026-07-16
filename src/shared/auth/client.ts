'use client';

import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { termsAcceptanceClientFields } from './terms-contract';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || undefined,
  plugins: [inferAdditionalFields({ user: termsAcceptanceClientFields })],
});

export const { signIn, signUp, useSession } = authClient;

export async function signOut() {
  const result = await authClient.signOut();
  if (result.error) throw new Error('Unable to close the server session.');
  return result;
}
