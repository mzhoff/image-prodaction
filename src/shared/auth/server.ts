import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

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
  const baseURL = readRequiredEnv('BETTER_AUTH_URL');

  return betterAuth({
    baseURL,
    secret: readRequiredEnv('BETTER_AUTH_SECRET'),
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema,
    }),
    trustedOrigins: readTrustedOrigins(baseURL),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    rateLimit: {
      enabled: true,
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
            const { ensurePersonalWorkspace } = await import('@/entities/workspace/server/workspace-service');
            await ensurePersonalWorkspace({
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

function readRequiredEnv(name: 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL') {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Better Auth.`);
  return value;
}

function readTrustedOrigins(baseURL: string) {
  const configured = process.env.BETTER_AUTH_TRUSTED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

  return Array.from(new Set([baseURL, ...configured]));
}
