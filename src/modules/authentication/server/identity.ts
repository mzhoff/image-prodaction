import { readIdentityClientConfig } from '@reverie/identity-client';
import { identityPlugin } from '@reverie/identity-client/better-auth';
import { CURRENT_TERMS_VERSION } from '@/shared/auth/terms-contract';
import { readAuthAccessPolicyConfig } from '@/shared/auth/config';

export function identityPlugins() {
  const config = readIdentityClientConfig(process.env, 'image-production');
  if (!config) return [];
  if (new URL(config.redirectURI).pathname !== '/api/auth/identity/callback') throw new Error('Invalid Image Production Identity callback');
  return [identityPlugin({ ...config, successPath: '/', loginPath: '/login', enabledMethods: process.env.REVERIE_IDENTITY_EMAIL_ENABLED === 'false' ? ['telegram'] : ['email', 'telegram'], newUserFields: () => {
    if (!readAuthAccessPolicyConfig().allowSignUp) throw new Error('Registration is closed');
    return { termsAccepted: true, termsVersion: CURRENT_TERMS_VERSION };
  } })];
}
