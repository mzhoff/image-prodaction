import { open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Canonical parent resolution prevents apparent external paths pointing into the repository. */
export async function openNewRuntimeCredentialFile(requestedFile: string, repositoryRoot: string) {
  const requested = resolve(requestedFile);
  const [canonicalRoot, canonicalParent] = await Promise.all([
    realpath(repositoryRoot), realpath(dirname(requested)),
  ]);
  const file = join(canonicalParent, basename(requested));
  const fromRoot = relative(canonicalRoot, file);
  const outside = isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith(`..${sep}`);
  if (!outside) throw new Error('Credential files must be outside the repository.');
  // Exclusive creation refuses existing regular files and final-component symlinks.
  const handle = await open(file, 'wx', 0o600);
  return { file, handle };
}
