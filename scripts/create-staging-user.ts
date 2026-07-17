import { readFileSync } from 'node:fs';
import { getAuth } from '@/shared/auth/server';
import { CURRENT_TERMS_VERSION } from '@/shared/auth/terms-contract';

const [rawEmail = '', rawName = '', password = ''] = readFileSync(0, 'utf8')
  .replace(/\r/g, '')
  .split('\n');
const email = rawEmail.trim().toLowerCase();
const name = rawName.trim();

if (!email || !email.includes('@')) {
  throw new Error('A valid email is required.');
}
if (!name) {
  throw new Error('A user name is required.');
}
if (password.length < 8 || password.length > 128) {
  throw new Error('The temporary password must contain between 8 and 128 characters.');
}

try {
  const auth = await getAuth();
  const result = await auth.api.signUpEmail({
    body: {
      email,
      name,
      password,
      termsAccepted: true,
      termsVersion: CURRENT_TERMS_VERSION,
    },
  });

  if (!result.user?.id) {
    throw new Error('Better Auth did not return a created user.');
  }

  process.stdout.write(`user_created=${result.user.id}\n`);
} catch {
  process.stderr.write(
    'Unable to create the user. Verify that the email is new and the runtime services are healthy.\n',
  );
  process.exitCode = 1;
}
