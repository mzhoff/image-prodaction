import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const coreEntry = require.resolve('@esbuild-kit/core-utils');
const coreRequire = createRequire(coreEntry);
const loaderEntry = require.resolve('@esbuild-kit/esm-loader');
const drizzleDirectory = dirname(require.resolve('drizzle-kit'));
const expectedVersion = '0.25.12';
process.env.ESBK_DISABLE_CACHE = '1';
const core = require('@esbuild-kit/core-utils');

test('legacy loader resolves the explicitly verified esbuild release', () => {
  assert.equal(coreRequire('esbuild').version, expectedVersion);
});

test('old core-utils compiles TypeScript to executable CommonJS and preserves source maps', () => {
  const result = core.transformSync('export const value: number = 42;', '/virtual/compat.cts');
  const compiledModule = { exports: {} };
  new Function('module', 'exports', 'require', result.code)(compiledModule, compiledModule.exports, require);
  assert.equal(compiledModule.exports.value, 42);
  assert.ok(result.map.sources.some((source) => source.endsWith('compat.cts')));
});

test('old core-utils compiles enums to ESM and transforms JSX with the patched esbuild', async () => {
  const result = await core.transform('enum Kind { Image = 7 }; export const kind = Kind.Image;', '/virtual/compat.mts');
  assert.equal((await import(`data:text/javascript,${encodeURIComponent(result.code)}`)).kind, 7);
  const jsx = await core.transform('export const card = <button title="Ready">Run</button>;', '/virtual/compat.tsx', { jsxFactory: 'h' });
  assert.match(jsx.code, /h\("button"/);
});

test('the resolved esbuild server does not grant arbitrary-origin access to its test bundle', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'esbuild-cors-proof-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'probe.ts'), 'console.log("release-fixture-only");\n');
  const context = await coreRequire('esbuild').context({
    entryPoints: [join(root, 'probe.ts')], outfile: join(root, 'probe.js'), write: false,
  });
  try {
    const server = await context.serve({ host: '127.0.0.1', port: 0, servedir: root });
    const response = await fetch(`http://127.0.0.1:${server.port}/probe.js`, {
      headers: { Origin: 'https://untrusted.example' }, signal: AbortSignal.timeout(5_000),
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /release-fixture-only/);
    const origin = response.headers.get('access-control-allow-origin');
    assert.notEqual(origin, '*');
    assert.notEqual(origin, 'https://untrusted.example');
  } finally { await context.dispose(); }
});

test('legacy ESM loader executes typed imports with Node native type stripping disabled', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'esbuild-loader-proof-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'value.mts'), 'export enum Kind { Video = 9 }\n');
  await writeFile(join(root, 'entry.mts'), 'import { Kind } from "./value.mts"; console.log(JSON.stringify({value:Kind.Video}));\n');
  const result = spawnSync(process.execPath, ['--no-experimental-strip-types', '--loader', loaderEntry, join(root, 'entry.mts')], {
    cwd: root, encoding: 'utf8', timeout: 20_000, env: { ...process.env, ESBK_DISABLE_CACHE: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { value: 9 });
});

test('Drizzle generates and checks a PostgreSQL migration through its TypeScript config without a database', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'drizzle-loader-proof-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const schema = join(root, 'schema.ts');
  const config = join(root, 'drizzle.config.ts');
  const out = join(root, 'migrations');
  const orm = pathToFileURL(require.resolve('drizzle-orm/pg-core')).href;
  await writeFile(schema, `import { pgTable, text } from ${JSON.stringify(orm)};\nexport const testRecord = pgTable('release_loader_probe', { id: text('id').primaryKey() });\n`);
  await writeFile(config, `export default { dialect: 'postgresql', schema: ${JSON.stringify(schema)}, out: './migrations' };\n`);
  for (const action of ['generate', 'check']) {
    const result = spawnSync(process.execPath, [join(drizzleDirectory, 'bin.cjs'), action, `--config=${config}`], {
      cwd: root, encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, DATABASE_URL: '', ESBK_DISABLE_CACHE: '1' },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  const migrations = (await readdir(out)).filter((name) => name.endsWith('.sql'));
  assert.equal(migrations.length, 1);
  assert.match(await readFile(join(out, migrations[0]), 'utf8'), /CREATE TABLE "release_loader_probe"/);
});
