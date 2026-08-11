import { readFile } from 'node:fs/promises';

const CHAT_PACKAGE_PREFIX = '@prodactionpro/chat-';
const EXACT_STABLE_VERSION = /^\d+\.\d+\.\d+$/;
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
];

const [manifest, lockfile] = await Promise.all([
  readJson('package.json'),
  readJson('package-lock.json'),
]);

const directPackages = new Map();
for (const section of DEPENDENCY_SECTIONS) {
  for (const [name, version] of Object.entries(manifest[section] ?? {})) {
    if (!name.startsWith(CHAT_PACKAGE_PREFIX)) continue;
    directPackages.set(name, { section, version });
  }
}

if (directPackages.size === 0) {
  console.log('ChatModule packages are not installed yet; version-family check skipped.');
  process.exit(0);
}

const failures = [];
for (const [name, { section, version }] of directPackages) {
  if (!EXACT_STABLE_VERSION.test(version)) {
    failures.push(
      `${name} in ${section} must use an exact stable version, received ${JSON.stringify(version)}`,
    );
  }
}

const directVersions = new Set(
  [...directPackages.values()].map(({ version }) => version),
);
if (directVersions.size !== 1) {
  failures.push(
    `direct ChatModule packages must share one version, received: ${[...directVersions].sort().join(', ')}`,
  );
}

const [expectedVersion] = directVersions;
const lockedPackages = Object.entries(lockfile.packages ?? {}).filter(([path]) => (
  /^node_modules\/@prodactionpro\/chat-[^/]+$/.test(path)
));

if (lockedPackages.length === 0) {
  failures.push('package-lock.json does not contain the installed ChatModule family');
}

for (const [path, record] of lockedPackages) {
  if (record.version !== expectedVersion) {
    failures.push(
      `${path} is locked at ${JSON.stringify(record.version)}, expected ${JSON.stringify(expectedVersion)}`,
    );
  }
}

if (failures.length > 0) {
  console.error('ChatModule dependency policy failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `ChatModule dependency policy passed: ${lockedPackages.length} packages at ${expectedVersion}.`,
);

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
