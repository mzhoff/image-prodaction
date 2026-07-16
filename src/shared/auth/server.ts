import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { readAuthServerConfig } from './config';
import { termsAcceptanceAdditionalFields } from './terms-policy';
import { ensurePersonalWorkspaceForUser } from './workspace-bootstrap';

let authPromise: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  authPromise ??= createAuth();
  return authPromise;
}

async function createAuth() {
  const [{ getDb }, schema] = await Promise.all([
    import('@/shared/db/client'),
    import('@/shared/db/schema'),
  ]);
  const config = readAuthServerConfig();

  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema,
    }),
    trustedOrigins: config.trustedOrigins,
    user: {
      additionalFields: termsAcceptanceAdditionalFields,
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            await ensurePersonalWorkspaceForUser({
              id: createdUser.id,
              email: createdUser.email,
              name: createdUser.name,
            });
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}
