import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAuthEmailDeliveryCompatibility,
  readAuthEmailPolicyConfig,
} from '@/shared/auth/config';
import { readEmailDeliveryConfig } from './config';
import { dispatchAuthEmail } from './dispatch';
import { EmailService } from './service';
import { createSmtpEmailTransport } from './smtp-transport';
import {
  renderPasswordChangedTemplate,
  renderResetPasswordTemplate,
  renderVerifyEmailTemplate,
} from './templates';
import type { EmailMessage, EmailTransport } from './transport';

test('local email configuration uses Mailpit-friendly defaults without credentials', () => {
  assert.deepEqual(readEmailDeliveryConfig({ NODE_ENV: 'development' }), {
    mode: 'smtp',
    from: 'Reverie <no-reply@reverie.local>',
    host: 'localhost',
    port: 1025,
    secure: false,
  });

  assert.deepEqual(readEmailDeliveryConfig({
    NODE_ENV: 'production',
    EMAIL_TRANSPORT: 'disabled',
  }), {
    mode: 'disabled',
  });
});

test('production SMTP requires explicit sender, connection security and credentials', () => {
  assert.throws(() => readEmailDeliveryConfig({
    NODE_ENV: 'production',
    EMAIL_TRANSPORT: 'smtp',
  }), /EMAIL_FROM is required/);

  assert.throws(() => readEmailDeliveryConfig({
    NODE_ENV: 'production',
    EMAIL_TRANSPORT: 'smtp',
    EMAIL_FROM: 'Reverie <no-reply@example.com>',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
  }), /SMTP_USER and SMTP_PASSWORD are required/);

  assert.throws(() => readEmailDeliveryConfig({
    NODE_ENV: 'development',
    EMAIL_FROM: 'Reverie <safe@example.com>\r\nBcc: attacker@example.com',
  }), /must not contain line breaks/);

  assert.throws(() => readEmailDeliveryConfig({
    NODE_ENV: 'development',
    SMTP_PORT: '70000',
  }), /between 1 and 65535/);
});

test('auth email policy is strict, locally mandatory and can be explicitly disabled', () => {
  assert.deepEqual(readAuthEmailPolicyConfig({ NODE_ENV: 'development' }), {
    requireEmailVerification: true,
    verificationTokenTTLSeconds: 3_600,
    passwordResetTokenTTLSeconds: 3_600,
  });
  assert.equal(
    readAuthEmailPolicyConfig({ NODE_ENV: 'production' }).requireEmailVerification,
    true,
  );

  assert.deepEqual(readAuthEmailPolicyConfig({
    NODE_ENV: 'production',
    AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
    AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: '7200',
    AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS: '1800',
  }), {
    requireEmailVerification: false,
    verificationTokenTTLSeconds: 7_200,
    passwordResetTokenTTLSeconds: 1_800,
  });

  assert.throws(() => readAuthEmailPolicyConfig({
    AUTH_REQUIRE_EMAIL_VERIFICATION: 'yes',
  }), /must be either "true" or "false"/);

  assert.throws(() => readAuthEmailPolicyConfig({
    AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS: '60',
  }), /must be between/);
});

test('mandatory verification cannot start without an email transport', () => {
  assert.throws(() => assertAuthEmailDeliveryCompatibility({
    requireEmailVerification: true,
    verificationTokenTTLSeconds: 3_600,
    passwordResetTokenTTLSeconds: 3_600,
  }, 'disabled'), /requires an enabled email transport/);

  assert.doesNotThrow(() => assertAuthEmailDeliveryCompatibility({
    requireEmailVerification: false,
    verificationTokenTTLSeconds: 3_600,
    passwordResetTokenTTLSeconds: 3_600,
  }, 'disabled'));
});

test('email templates escape untrusted values and include plain-text fallbacks', () => {
  const actionUrl = 'https://app.example.com/verify?token=safe&next=/';
  const verification = renderVerifyEmailTemplate({
    name: '<script>alert("x")</script>',
    actionUrl,
    expiresInSeconds: 86_400,
  });
  const reset = renderResetPasswordTemplate({
    name: 'Михаил',
    actionUrl: 'https://app.example.com/reset?token=test',
    expiresInSeconds: 3_600,
  });
  const changed = renderPasswordChangedTemplate({
    name: 'Михаил',
    signInUrl: 'https://app.example.com/login',
  });

  assert.equal(verification.subject, 'Подтвердите email в Reverie');
  assert.match(verification.text, /Подтвердить email: https:\/\/app\.example\.com/);
  assert.match(verification.text, /1 день/);
  assert.doesNotMatch(verification.html, /<script>/);
  assert.match(verification.html, /&lt;script&gt;/);
  assert.match(verification.html, /token=safe&amp;next=\//);
  assert.equal(reset.subject, 'Сбросьте пароль в Reverie');
  assert.match(reset.text, /1 час/);
  assert.equal(changed.subject, 'Пароль в Reverie изменён');
  assert.match(changed.text, /Все активные сессии завершены/);
});

test('EmailService dispatches provider-neutral messages through an injected transport', async () => {
  const messages: EmailMessage[] = [];
  const transport: EmailTransport = {
    async send(message) {
      messages.push(message);
    },
  };
  const service = new EmailService(transport, {
    from: 'Reverie <no-reply@example.com>',
    replyTo: 'support@example.com',
  });

  await service.sendVerificationEmail({
    email: 'user@example.com',
    name: 'User',
    actionUrl: 'https://app.example.com/verify',
    expiresInSeconds: 3_600,
  });
  await service.sendPasswordResetEmail({
    email: 'user@example.com',
    name: 'User',
    actionUrl: 'https://app.example.com/reset',
    expiresInSeconds: 3_600,
  });
  await service.sendPasswordChangedEmail({
    email: 'user@example.com',
    name: 'User',
    signInUrl: 'https://app.example.com/login',
  });

  assert.equal(messages.length, 3);
  assert.deepEqual(messages.map(({ from, to, replyTo, subject }) => ({
    from,
    to,
    replyTo,
    subject,
  })), [
    {
      from: 'Reverie <no-reply@example.com>',
      to: 'user@example.com',
      replyTo: 'support@example.com',
      subject: 'Подтвердите email в Reverie',
    },
    {
      from: 'Reverie <no-reply@example.com>',
      to: 'user@example.com',
      replyTo: 'support@example.com',
      subject: 'Сбросьте пароль в Reverie',
    },
    {
      from: 'Reverie <no-reply@example.com>',
      to: 'user@example.com',
      replyTo: 'support@example.com',
      subject: 'Пароль в Reverie изменён',
    },
  ]);
});

test('SMTP transport maps connection settings without enabling protocol logging', async () => {
  let connectionOptions: unknown;
  const sentMessages: EmailMessage[] = [];
  const transport = createSmtpEmailTransport({
    mode: 'smtp',
    from: 'Reverie <no-reply@example.com>',
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    auth: {
      user: 'smtp-user',
      password: 'smtp-password',
    },
  }, (options) => {
    connectionOptions = options;
    return {
      async sendMail(message) {
        sentMessages.push(message);
      },
    };
  });

  await transport.send({
    from: 'Reverie <no-reply@example.com>',
    to: 'user@example.com',
    subject: 'Subject',
    text: 'Plain text',
    html: '<p>HTML</p>',
  });

  assert.deepEqual(connectionOptions, {
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    auth: {
      user: 'smtp-user',
      pass: 'smtp-password',
    },
    logger: false,
    debug: false,
  });
  assert.equal(sentMessages.length, 1);
});

test('auth dispatch hides transport failures from responses and reporter payloads', async () => {
  const reports: string[] = [];

  await assert.doesNotReject(() => dispatchAuthEmail(
    'password-reset',
    async () => {
      throw new Error('recipient=user@example.com token=secret');
    },
    (kind) => reports.push(kind),
  ));

  assert.deepEqual(reports, ['password-reset']);
});
