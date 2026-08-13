import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';

const root = process.cwd();
const sourceRoots = [join(root, 'app'), join(root, 'src')];
const files = (await Promise.all(sourceRoots.map(collectSourceFiles))).flat().sort();
const relativeFiles = new Set(files.map((file) => toProjectPath(file)));
const violations = [];
const dependencyGraph = new Map();

const fsdRanks = new Map([
  ['shared', 0],
  ['entities', 1],
  ['features', 2],
  ['widgets', 3],
  ['pages', 4],
  ['app', 5],
]);

for (const absolutePath of files) {
  const path = toProjectPath(absolutePath);
  const source = await readFile(absolutePath, 'utf8');
  const imports = extractImports(source);
  dependencyGraph.set(path, new Set());

  if (/\bOPENROUTER_API_KEY\b/.test(source)) {
    violations.push(`${path}: product code must resolve provider credentials from Workspace.`);
  }

  if (/NEXT_PUBLIC_CHAT_(?:OPENROUTER|TOOL|ASSISTANT_SECRET)/.test(source)) {
    violations.push(`${path}: chat credentials must remain server-only.`);
  }

  if (
    path.startsWith('src/modules/generation/')
    && /from ['"]@\/shared\/api\/openrouter(?:['"/])/.test(source)
  ) {
    violations.push(`${path}: generation domain must use the provider contract, not the legacy OpenRouter API client.`);
  }

  if (
    path.startsWith('src/modules/provider-connections/core/')
    && (source.includes('process.env') || /from ['"]next\//.test(source))
  ) {
    violations.push(`${path}: provider core must stay framework- and environment-agnostic.`);
  }

  if (
    /^src\/modules\/executable-pipelines\/(?:contracts|core)\//.test(path)
    && (
      source.includes('process.env')
      || /from ['"]next\//.test(source)
      || /from ['"]@\/shared\/db\//.test(source)
      || /from ['"].*provider-connections/.test(source)
      || /from ['"].*production-graph/.test(source)
    )
  ) {
    violations.push(
      `${path}: executable pipeline contracts/core must stay extractable and infrastructure-agnostic.`,
    );
  }

  for (const specifier of imports) {
    checkImportBoundary(path, source, specifier);
    const target = await resolveProjectImport(absolutePath, specifier);
    if (target && relativeFiles.has(target)) dependencyGraph.get(path).add(target);
  }
}

for (const cycle of findCycles(dependencyGraph)) {
  if (isDocumentedSchemaCycle(cycle)) continue;
  violations.push(`Circular dependency: ${cycle.join(' -> ')} -> ${cycle[0]}`);
}

if (violations.length) {
  console.error('Architecture boundary check failed:\n');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`Architecture boundary check passed for ${files.length} source files.`);
}

function checkImportBoundary(sourcePath, source, specifier) {
  const targetPath = aliasTargetPath(specifier);
  if (!targetPath) return;

  const sourceLayer = getLayer(sourcePath);
  const targetLayer = getLayer(targetPath);
  const sourceRank = fsdRanks.get(sourceLayer);
  const targetRank = fsdRanks.get(targetLayer);

  if (sourceRank !== undefined && targetRank !== undefined && sourceRank < targetRank) {
    violations.push(
      `${sourcePath}: FSD layer ${sourceLayer} cannot import upward from ${targetLayer} (${specifier}).`,
    );
  }

  if (
    sourceLayer === 'modules'
    && ['app', 'pages', 'widgets', 'features'].includes(targetLayer)
  ) {
    violations.push(`${sourcePath}: backend modules cannot depend on UI layer ${targetLayer} (${specifier}).`);
  }

  if (
    isServerApplicationFile(sourcePath)
    && ['pages', 'widgets', 'features'].includes(targetLayer)
  ) {
    violations.push(`${sourcePath}: backend application code cannot import UI layer ${targetLayer} (${specifier}).`);
  }

  if (isClientModule(source) && isServerOnlyTarget(targetPath)) {
    violations.push(`${sourcePath}: client code cannot import server-only module ${specifier}.`);
  }
}

function getLayer(path) {
  if (path.startsWith('app/')) return 'app';
  const match = path.match(/^src\/([^/]+)\//);
  return match?.[1];
}

function aliasTargetPath(specifier) {
  return specifier.startsWith('@/') ? `src/${specifier.slice(2)}` : undefined;
}

function isServerApplicationFile(path) {
  return path.startsWith('src/app/api-routes/')
    || /^src\/entities\/[^/]+\/server\//.test(path)
    || /^src\/modules\/[^/]+\/server\//.test(path);
}

function isClientModule(source) {
  return /^\s*['"]use client['"];/.test(source);
}

function isServerOnlyTarget(path) {
  return path.startsWith('src/app/api-routes/')
    || /^src\/entities\/[^/]+\/server\//.test(path)
    || /^src\/modules\/[^/]+\/server\//.test(path)
    || path.startsWith('src/shared/db/')
    || path.startsWith('src/shared/auth/server')
    || path.startsWith('src/shared/storage/s3-');
}

function extractImports(source) {
  const imports = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.add(match[1]);
  }
  return imports;
}

async function resolveProjectImport(sourcePath, specifier) {
  let basePath;
  if (specifier.startsWith('@/')) basePath = join(root, 'src', specifier.slice(2));
  else if (specifier.startsWith('.')) basePath = resolve(dirname(sourcePath), specifier);
  else return undefined;

  const candidates = extname(basePath)
    ? [basePath]
    : [
        ...['.ts', '.tsx', '.js', '.jsx', '.mjs'].map((extension) => `${basePath}${extension}`),
        ...['.ts', '.tsx', '.js', '.jsx', '.mjs'].map((extension) => join(basePath, `index${extension}`)),
      ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return toProjectPath(candidate);
    } catch {
      // Try the next supported source-file shape.
    }
  }
  return undefined;
}

function findCycles(graph) {
  const cycles = new Map();
  const visited = new Set();
  const active = new Set();
  const stack = [];

  const visit = (node) => {
    if (active.has(node)) {
      const cycle = stack.slice(stack.indexOf(node));
      const canonical = canonicalCycle(cycle);
      cycles.set(canonical.join('|'), canonical);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    active.add(node);
    stack.push(node);
    for (const target of graph.get(node) ?? []) visit(target);
    stack.pop();
    active.delete(node);
  };

  for (const node of graph.keys()) visit(node);
  return [...cycles.values()];
}

function canonicalCycle(cycle) {
  const rotations = cycle.map((_, index) => [...cycle.slice(index), ...cycle.slice(0, index)]);
  return rotations.sort((left, right) => left.join('|').localeCompare(right.join('|')))[0];
}

function isDocumentedSchemaCycle(cycle) {
  return cycle.length === 2
    && cycle.includes('src/shared/db/schema/asset.ts')
    && cycle.includes('src/shared/db/schema/generation.ts');
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return ['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(extname(entry.name)) ? [path] : [];
  }));
  return nested.flat();
}

function toProjectPath(path) {
  return normalize(relative(root, path)).replaceAll('\\', '/');
}
