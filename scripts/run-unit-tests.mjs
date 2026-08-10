import { readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const coverage = process.argv.includes('--coverage');
const testFiles = (await collectTestFiles(join(root, 'src')))
  .map((path) => relative(root, path))
  .sort();

const nodeArguments = [
  '--experimental-strip-types',
  '--loader',
  './scripts/node-test-loader.mjs',
];

if (coverage) {
  nodeArguments.push(
    '--experimental-test-coverage',
    '--test-coverage-branches=70',
    '--test-coverage-functions=60',
    '--test-coverage-lines=65',
    '--test-coverage-include=src/**/*.ts',
    '--test-coverage-exclude=src/**/*.test.ts',
  );
}

nodeArguments.push('--test', ...testFiles);
const result = spawnSync(process.execPath, nodeArguments, {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTestFiles(path);
    return ['.ts', '.tsx'].includes(extname(entry.name)) && /\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  }));
  return nested.flat();
}
