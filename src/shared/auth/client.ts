'use client';

import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { termsAcceptanceClientFields } from './terms-contract';
import { stopBehavior } from '@/shared/analytics/client';

export function createProductAuthClient(browserOrigin?: string) {
  return createAuthClient({
    // Product sessions belong to the current site, including local UI proxies.
    // BETTER_AUTH_URL remains the server's canonical URL for links and callbacks.
    baseURL: browserOrigin,
    plugins: [inferAdditionalFields({ user: termsAcceptanceClientFields })],
  });
}

export const authClient = createProductAuthClient(
  typeof window === 'undefined' ? undefined : window.location.origin,
);

export const { signIn, signUp, useSession } = authClient;

export async function signOut() {
  const result = await authClient.signOut();
  if (result.error) throw new Error('Unable to close the server session.');
  stopBehavior();
  return result;
}
