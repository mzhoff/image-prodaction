import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { test as base, expect } from '@playwright/test';

/** The default E2E server uses local email auth; this public-page fixture renders Identity mode. */
export const test = base.extend<object, { identityEntryOrigin: string }>({
  identityEntryOrigin: [async ({}, provide) => {
    const reservation = createServer();
    await new Promise<void>((ready) => reservation.listen(0, '127.0.0.1', ready));
    const address = reservation.address();
    if (!address || typeof address === 'string') throw new Error('Cannot reserve an Identity entry preview port.');
    const port = address.port;
    await new Promise<void>((done) => reservation.close(() => done()));
    const origin = `http://127.0.0.1:${port}`;
    // No inherited credentials or live Identity/DB endpoints. These tests never submit a login.
    const child = spawn(process.execPath, ['server.js'], {
      cwd: resolve('.next/standalone'), stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH ?? '', NODE_ENV: 'production', CI: 'true',
        HOSTNAME: '127.0.0.1', PORT: String(port), NEXT_TELEMETRY_DISABLED: '1',
        DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:9/identity_entry_no_database',
        BETTER_AUTH_URL: origin, BETTER_AUTH_TRUSTED_ORIGINS: origin,
        BETTER_AUTH_SECRET: 'identity-entry-fixture-only-secret-2026',
        EMAIL_TRANSPORT: 'smtp', EMAIL_FROM: 'Fixture <fixture@example.test>',
        SMTP_HOST: '127.0.0.1', SMTP_PORT: '9', SMTP_SECURE: 'false',
        SMTP_USER: 'fixture', SMTP_PASSWORD: 'fixture-only-unused',
        REVERIE_IDENTITY_ISSUER: 'http://127.0.0.1:9/api/auth',
        REVERIE_IDENTITY_CALLBACK_URL: `${origin}/api/auth/identity/callback`,
        REVERIE_IDENTITY_LOCAL_DEVELOPMENT: 'true', METRICA_MODE: 'off',
      },
    });
    let startupLog = '';
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', (data: Buffer) => {
      startupLog = (startupLog + data.toString()).slice(-4000);
    });
    let startupError = false;
    child.once('error', () => { startupError = true; });
    try {
      await expect.poll(async () => {
        if (startupError || child.exitCode !== null) throw new Error('Identity entry preview stopped before readiness.');
        try { return (await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) })).status; }
        catch { return 0; }
      }, { timeout: 15_000 }).toBe(200).catch((error: unknown) => {
        const detail = startupLog.match(/^Error: [^\n]+/gm)?.at(-1) ?? 'See the readiness assertion.';
        throw new Error(`Identity entry preview did not become ready. ${detail}`, { cause: error });
      });
      await provide(origin);
    } finally {
      if (child.exitCode === null && !startupError) {
        child.kill('SIGTERM');
        await new Promise<void>((done) => {
          const timer = setTimeout(() => { child.kill('SIGKILL'); done(); }, 5000);
          child.once('exit', () => { clearTimeout(timer); done(); });
        });
      }
    }
  }, { scope: 'worker' }],
  baseURL: async ({ identityEntryOrigin }, provide) => { await provide(identityEntryOrigin); },
});

export { expect };
