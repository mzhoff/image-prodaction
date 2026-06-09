import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT_PATH = process.cwd();
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.json'];

function isPathSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/') || specifier.startsWith('file:');
}

function hasFileExtension(specifier) {
  return Boolean(path.extname(specifier));
}

export async function resolve(specifier, context, defaultResolve) {
  let resolvedSpecifier = specifier;

  if (specifier.startsWith('@/')) {
    resolvedSpecifier = pathToFileURL(path.join(ROOT_PATH, 'src', specifier.slice(2))).href;
  }

  if (context.parentURL && !hasFileExtension(resolvedSpecifier) && isPathSpecifier(resolvedSpecifier)) {
    const absoluteUrl = new URL(resolvedSpecifier, context.parentURL);
    const absolutePath = absoluteUrl.pathname;

    for (const ext of SOURCE_EXTENSIONS) {
      const candidatePath = `${absolutePath}${ext}`;
      if (fs.existsSync(candidatePath)) {
        return defaultResolve(pathToFileURL(candidatePath).href, context);
      }
    }

    if (fs.existsSync(path.join(absolutePath, 'index.ts'))) {
      return defaultResolve(pathToFileURL(path.join(absolutePath, 'index.ts')).href, context);
    }
  }

  return defaultResolve(resolvedSpecifier, context);
}
