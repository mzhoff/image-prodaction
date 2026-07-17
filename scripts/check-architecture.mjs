import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const sourceRoot = join(root, 'src');
const files = await collectSourceFiles(sourceRoot);
const violations = [];

for (const absolutePath of files) {
  const path = relative(root, absolutePath);
  const source = await readFile(absolutePath, 'utf8');

  if (source.includes('OPENROUTER_API_KEY')) {
    violations.push(`${path}: product code must resolve provider credentials from Workspace.`);
  }

  if (
    path.startsWith('src/modules/generation/')
    && /from ['"]@\/shared\/api\/openrouter(?:['"/])/.test(source)
  ) {
    violations.push(`${path}: generation domain must use the provider contract, not the legacy OpenRouter API client.`);
  }

  if (
    (source.startsWith("'use client'") || source.startsWith('"use client"'))
    && /from ['"]@\/modules\/[^'"]+\/server\//.test(source)
  ) {
    violations.push(`${path}: client modules cannot import server-only domain code.`);
  }

  if (
    path.startsWith('src/modules/provider-connections/core/')
    && (source.includes('process.env') || /from ['"]next\//.test(source))
  ) {
    violations.push(`${path}: provider core must stay framework- and environment-agnostic.`);
  }
}

if (violations.length) {
  console.error('Architecture boundary check failed:\n');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`Architecture boundary check passed for ${files.length} source files.`);
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return ['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(extname(entry.name))
      ? [path]
      : [];
  }));
  return nested.flat();
}
