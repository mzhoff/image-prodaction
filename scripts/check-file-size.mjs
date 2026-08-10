import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const maxLines = 300;
const baseline = JSON.parse(await readFile(
  join(root, 'scripts/file-size-baseline.json'),
  'utf8',
));
const files = await collectImplementationFiles(join(root, 'src'));
const currentLines = new Map();
const violations = [];

for (const absolutePath of files) {
  const path = relative(root, absolutePath).replaceAll('\\', '/');
  const source = await readFile(absolutePath, 'utf8');
  const lines = source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
  currentLines.set(path, lines);
  if (lines <= maxLines) continue;

  const previousLimit = baseline[path];
  if (!previousLimit) {
    violations.push(`${path}: ${lines} lines; new implementation files must stay at or below ${maxLines}.`);
  } else if (lines > previousLimit) {
    violations.push(`${path}: grew from the ratchet limit ${previousLimit} to ${lines} lines.`);
  }
}

for (const path of Object.keys(baseline)) {
  const lines = currentLines.get(path);
  if (lines === undefined) violations.push(`${path}: stale baseline entry for a missing file.`);
  else if (lines <= maxLines) violations.push(`${path}: now has ${lines} lines; remove its stale baseline entry.`);
}

if (violations.length) {
  console.error('File-size check failed:\n');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`File-size check passed for ${files.length} implementation files (${Object.keys(baseline).length} legacy files ratcheted).`);
}

async function collectImplementationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectImplementationFiles(path);
    if (!['.ts', '.tsx'].includes(extname(entry.name))) return [];
    if (/\.(?:test|spec)\.tsx?$/.test(entry.name) || entry.name.endsWith('.d.ts')) return [];
    return [path];
  }));
  return nested.flat();
}
