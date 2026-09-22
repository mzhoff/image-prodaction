import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const sections = ['dependencies', 'devDependencies', 'optionalDependencies'];
const registryHosts = new Set(['registry.npmjs.org', 'npm.pkg.github.com']);
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const packageName = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i;

function command(cwd, name, args, maxBuffer = 4 * 1024 * 1024) {
  const result = spawnSync(name, args, { cwd, encoding: 'utf8', timeout: 20_000, maxBuffer });
  if (result.error || result.status !== 0) throw new Error(`${name} verification failed`);
  return result.stdout;
}

function localPath(root, source) {
  const path = decodeURIComponent(source.slice(5));
  if (!path || isAbsolute(path) || path.includes('\\') || path.includes('\0')) {
    throw new Error('file source must be a repository-relative archive');
  }
  const absolute = resolve(root, path);
  const relativePath = relative(root, absolute);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || !/\.(?:tgz|tar\.gz)$/.test(path)) {
    throw new Error('file source must be an archive inside the repository');
  }
  return { absolute, relativePath: relativePath.split(sep).join('/') };
}

function integrityDigest(integrity) {
  // npm-generated lockfiles in this product use one SHA-512 SRI digest.
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity ?? '');
  if (!match || Buffer.from(match[1], 'base64').length !== 64
    || Buffer.from(match[1], 'base64').toString('base64') !== match[1]) {
    throw new Error('lock entry must contain a valid SHA-512 integrity digest');
  }
  return match[1];
}

function remoteSource(source) {
  let url;
  try { url = new URL(source); } catch { throw new Error('lock source must be HTTPS or file:'); }
  if (url.protocol !== 'https:' || !registryHosts.has(url.hostname) || url.port
    || url.username || url.password || url.search || url.hash) {
    throw new Error('remote source must use an approved HTTPS registry without credentials or query parameters');
  }
  return url;
}

function assertRemoteIdentity(source, name, version) {
  const url = remoteSource(source);
  const path = decodeURIComponent(url.pathname);
  const basename = name.split('/').at(-1);
  const expected = url.hostname === 'registry.npmjs.org'
    ? `/${name}/-/${basename}-${version}.tgz`
    : `/download/${name}/${version}/`;
  if (url.hostname === 'registry.npmjs.org' ? path !== expected : !path.startsWith(expected)) {
    throw new Error('registry source does not match the locked package name/version');
  }
}

async function verifyArchive(root, source, record, name) {
  const { absolute, relativePath } = localPath(root, source);
  const info = await lstat(absolute).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink() || await realpath(absolute) !== absolute) {
    throw new Error('local archive is missing, is a symlink, or escapes the repository');
  }
  const index = command(root, 'git', ['ls-files', '--stage', '-z', '--', relativePath]);
  const entries = index.split('\0').filter(Boolean);
  if (entries.length !== 1 || !/^100(?:644|755) [0-9a-f]+ 0\t/.test(entries[0])) {
    throw new Error('local archive is not tracked in the Git index (or has unresolved conflicts)');
  }
  const indexedHash = entries[0].split(' ')[1];
  const currentHash = command(root, 'git', ['hash-object', '--no-filters', '--', relativePath]).trim();
  if (indexedHash !== currentHash) throw new Error('local archive differs from the Git index; stage the intended bytes');
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(absolute)) hash.update(chunk);
  if (hash.digest('base64') !== integrityDigest(record.integrity)) {
    throw new Error('local archive checksum does not match package-lock.json');
  }
  const names = command(root, 'tar', ['-tzf', absolute]).split('\n');
  if (names.filter((entry) => entry === 'package/package.json').length !== 1) {
    throw new Error('archive must contain exactly one package/package.json');
  }
  let manifest;
  try {
    manifest = JSON.parse(command(root, 'tar', ['-xOzf', absolute, 'package/package.json'], 256 * 1024));
  } catch { throw new Error('archive package manifest cannot be read'); }
  if (manifest.name !== name || manifest.version !== record.version) {
    throw new Error('archive package name/version differs from the lock entry');
  }
  return relativePath;
}

export async function checkReleasePackageSources(root = process.cwd()) {
  root = await realpath(root);
  const [manifest, lock] = await Promise.all(['package.json', 'package-lock.json'].map(async (file) => (
    JSON.parse(await readFile(resolve(root, file), 'utf8'))
  )));
  const failures = [];
  const report = { remotePackages: 0, localArchives: [], failures };
  if (![2, 3].includes(lock.lockfileVersion) || !lock.packages?.['']) {
    failures.push('package-lock.json must have a v2/v3 packages table and root entry');
    return report;
  }
  const rootLock = lock.packages[''];
  for (const section of sections) {
    const desired = manifest[section] ?? {};
    const locked = rootLock[section] ?? {};
    for (const name of new Set([...Object.keys(desired), ...Object.keys(locked)])) {
      if (!packageName.test(name)) { failures.push(`${section}: invalid package name`); continue; }
      if (desired[name] !== locked[name]) failures.push(`${name}: manifest and lock root disagree in ${section}`);
      if (!(name in desired)) continue;
      const record = lock.packages[`node_modules/${name}`];
      if (!record) { failures.push(`${name}: direct dependency is missing from lock packages`); continue; }
      const spec = desired[name];
      try {
        if (typeof spec !== 'string' || !spec.trim()) throw new Error('manifest source must be a nonempty string');
        if (spec.startsWith('file:')) {
          if (!record.resolved?.startsWith('file:')
            || localPath(root, spec).absolute !== localPath(root, record.resolved).absolute) {
            throw new Error('manifest file source differs from lock source');
          }
        } else {
          // npm ci remains the semver-range solver. This gate validates provenance.
          if (!/^[0-9A-Za-z.*+^~<>=| -]+$/.test(spec)) throw new Error('unsupported manifest source (git, URLs, aliases and links require an explicit policy)');
          if (record.resolved?.startsWith('file:')) throw new Error('registry dependency unexpectedly resolves to a local archive');
          if (exactVersion.test(spec) && spec !== record.version) throw new Error('exact manifest version differs from lock version');
        }
      } catch (error) { failures.push(`${name}: ${error.message}`); }
    }
  }
  for (const [path, record] of Object.entries(lock.packages)) {
    if (!path) continue;
    const name = path.split('node_modules/').at(-1);
    if (!path.startsWith('node_modules/') || !packageName.test(name)) {
      failures.push('lock contains a non-package path or a workspace record');
      continue;
    }
    try {
      if (record.link || record.inBundle) throw new Error('linked or bundled lock entries are not supported by the release source policy');
      if (!exactVersion.test(record.version ?? '')) throw new Error('lock entry must contain an exact package version');
      integrityDigest(record.integrity);
      if (record.resolved?.startsWith('file:')) {
        report.localArchives.push(await verifyArchive(root, record.resolved, record, name));
      } else {
        assertRemoteIdentity(record.resolved, name, record.version);
        report.remotePackages += 1;
      }
    } catch (error) {
      // Never echo the source URL/spec: malformed entries may contain credentials.
      failures.push(`${name}: ${error.code ? 'archive file verification failed' : error.message}`);
    }
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await checkReleasePackageSources();
    if (report.failures.length) {
      console.error('Release package source check failed:');
      for (const failure of report.failures) console.error(`- ${failure}`);
      process.exitCode = 1;
    } else {
      console.log(`Release package sources passed: ${report.remotePackages} registry packages, ${report.localArchives.length} tracked archives.`);
    }
  } catch {
    console.error('Release package source check could not read valid manifests or Git state.');
    process.exitCode = 1;
  }
}
