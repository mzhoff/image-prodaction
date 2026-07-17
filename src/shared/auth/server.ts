import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import {
  assertAuthEmailDeliveryCompatibility,
  readAuthEmailPolicyConfig,
  readAuthServerConfig,
} from './config';
import { readEmailDeliveryConfig } from '@/shared/email/config';
import { dispatchAuthEmail } from '@/shared/email/dispatch';
import { createSmtpEmailService } from '@/shared/email/service';
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
  const emailPolicy = readAuthEmailPolicyConfig();
  const emailDelivery = readEmailDeliveryConfig();
  assertAuthEmailDeliveryCompatibility(emailPolicy, emailDelivery.mode);
  const emailService = emailDelivery.mode === 'smtp'
    ? createSmtpEmailService(emailDelivery)
    : undefined;

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
      requireEmailVerification: emailPolicy.requireEmailVerification,
      resetPasswordTokenExpiresIn: emailPolicy.passwordResetTokenTTLSeconds,
      revokeSessionsOnPasswordReset: true,
      ...(emailService
        ? {
            sendResetPassword: async ({ user, url }) => {
              void dispatchAuthEmail('password-reset', () => (
                emailService.sendPasswordResetEmail({
                  email: user.email,
                  name: user.name,
                  actionUrl: url,
                  expiresInSeconds: emailPolicy.passwordResetTokenTTLSeconds,
                })
              ));
            },
            onPasswordReset: async ({ user }) => {
              void dispatchAuthEmail('password-changed', () => (
                emailService.sendPasswordChangedEmail({
                  email: user.email,
                  name: user.name,
                  signInUrl: `${config.baseURL}/login`,
                })
              ));
            },
          }
        : {}),
    },
    ...(emailService
      ? {
          emailVerification: {
            sendVerificationEmail: async ({ user, url }) => {
              void dispatchAuthEmail('verification', () => (
                emailService.sendVerificationEmail({
                  email: user.email,
                  name: user.name,
                  actionUrl: url,
                  expiresInSeconds: emailPolicy.verificationTokenTTLSeconds,
                })
              ));
            },
            sendOnSignUp: true,
            sendOnSignIn: false,
            autoSignInAfterVerification: true,
            expiresIn: emailPolicy.verificationTokenTTLSeconds,
          },
        }
      : {}),
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 3 },
        '/send-verification-email': { window: 60, max: 3 },
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
