import type { ProviderAdapter } from '../contracts/provider-contracts';
import { createFakeProviderAdapter } from '../adapters/fake-provider-adapter';
import { createOpenRouterProviderAdapter } from '../adapters/openrouter-provider-adapter';

const DEFAULT_FAKE_CREDENTIAL = 'fake-valid-credential';

export function createRuntimeOpenRouterAdapter(): ProviderAdapter {
  if (process.env.AI_PROVIDER_RUNTIME !== 'fake') {
    return createOpenRouterProviderAdapter({
      appName: process.env.OPENROUTER_APP_NAME ?? 'Reverie Image Production Pipeline',
      siteUrl: process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3004',
    });
  }

  if (process.env.CI !== 'true' && process.env.NODE_ENV !== 'test') {
    throw new Error(
      'AI_PROVIDER_RUNTIME=fake is allowed only when CI=true or NODE_ENV=test.',
    );
  }

  return createFakeProviderAdapter({
    acceptedCredential:
      process.env.FAKE_AI_PROVIDER_CREDENTIAL ?? DEFAULT_FAKE_CREDENTIAL,
    provider: 'openrouter',
  });
}
