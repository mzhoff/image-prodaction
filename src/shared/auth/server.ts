import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/shared/db/client';
import * as schema from '@/shared/db/schema';

function getRequiredAuthEnv(name: 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL') {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for Better Auth.`);
  }

  return value;
}

export const auth = betterAuth({
  baseURL: getRequiredAuthEnv('BETTER_AUTH_URL'),
  secret: getRequiredAuthEnv('BETTER_AUTH_SECRET'),
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [nextCookies()],
});
