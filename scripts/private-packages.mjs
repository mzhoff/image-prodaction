import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const KEYCHAIN_SERVICE = 'codex.image-prodaction.github-packages';
export const KEYCHAIN_ACCOUNT = 'mzhoff';
const TOKEN_ENV = 'PRODACTION_PACKAGES_READ_TOKEN';
const NPM_CONFIG = fileURLToPath(new URL('./private-packages.npmrc', import.meta.url));
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const NPM_COMMANDS = new Set(['ci', 'install', 'view', 'pack']);

export function readPackagesToken({
  env = process.env,
  platform = process.platform,
  readKeychain = () => execFileSync('/usr/bin/security', [
    'find-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', KEYCHAIN_SERVICE, '-w',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
} = {}) {
  let token = env[TOKEN_ENV];
  if (!token && platform === 'darwin') {
    try {
      token = readKeychain();
    } catch {
      // Never forward child-process errors: they can contain credential output.
      throw new Error('Не удалось прочитать токен GitHub Packages из Keychain.');
    }
  }
  token = token?.trim();
  if (!token || /\s/.test(token)) {
    throw new Error('Нет корректного токена GitHub Packages в Keychain или защищённом окружении.');
  }
  return token;
}

export function npmInvocation(args) {
  const [command, ...options] = args;
  if (!NPM_COMMANDS.has(command)) {
    throw new Error('Использование: npm run packages -- check | ci | install | view | pack');
  }
  return {
    command: 'npm',
    args: [command, ...options, '--ignore-scripts', '--loglevel=error', '--logs-max=0',
      `--userconfig=${NPM_CONFIG}`],
  };
}

export function packagesEnvironment(token, env = process.env) {
  return {
    ...env,
    [TOKEN_ENV]: token,
    NPM_CONFIG_USERCONFIG: NPM_CONFIG,
    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
    NPM_CONFIG_LOGS_MAX: '0',
    NPM_CONFIG_LOGLEVEL: 'error',
  };
}

export async function verifyPackagesToken(token, fetcher = fetch) {
  let response;
  try {
    response = await fetcher('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Не удалось проверить доступ к GitHub. Проверь подключение к сети.');
  }
  if (!response.ok) {
    throw new Error(`GitHub отклонил токен (HTTP ${response.status}).`);
  }
  const scopes = (response.headers.get('x-oauth-scopes') ?? '').split(',')
    .map((scope) => scope.trim()).filter(Boolean);
  if (scopes.length !== 1 || scopes[0] !== 'read:packages') {
    throw new Error('Для установки нужен отдельный токен только с read:packages.');
  }
  return { scopes, expires: response.headers.get('github-authentication-token-expiration') };
}

async function checkRegistry(token) {
  const version = '0.2.0-canary-reverie-20260910.2';
  for (const name of ['chat-ui', 'ui-tokens', 'ui-core']) {
    const response = await fetch(`https://npm.pkg.github.com/@prodactionpro%2f${name}`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Нет доступа к ${name} (HTTP ${response.status}).`);
    const metadata = await response.json();
    const status = name.startsWith('ui-')
      ? `; ${version}: ${metadata.versions?.[version] ? 'опубликована' : 'ещё не опубликована'}`
      : '';
    console.log(`@prodactionpro/${name}: доступ подтверждён${status}`);
  }
}

export async function main(args = process.argv.slice(2)) {
  const command = args[0] ?? 'check';
  const invocation = command === 'check' ? null : npmInvocation(args);
  const token = readPackagesToken();
  const access = await verifyPackagesToken(token);
  if (!invocation) {
    console.log(`GitHub Packages: read:packages; срок: ${access.expires ?? 'не указан'}`);
    await checkRegistry(token);
    return 0;
  }
  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: ROOT,
      env: packagesEnvironment(token),
      stdio: 'inherit',
    });
    child.once('error', () => {
      console.error('Не удалось запустить npm.');
      resolve(1);
    });
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch {
    // A nested npm/network error must not disclose request headers or secrets.
    console.error('Проверка/установка private packages не завершена. Проверь Keychain, read:packages и сеть.');
    process.exitCode = 1;
  }
}
