import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import { and, eq } from 'drizzle-orm';
import { normalizePortableProjectExport } from '@/entities/production-graph/model/project-portability';
import type { ProjectExport } from '@/entities/production-graph/model/project-schema';
import {
  createDocument,
  listDocuments,
  permanentlyDeleteDocument,
  saveDocumentSnapshot,
  updateDocumentMetadata,
} from '@/entities/document/server/document-service';
import { validateDocumentSnapshot } from '@/entities/document/server/document-validation';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { user } from '@/shared/db/schema/auth';
import { membership, workspace } from '@/shared/db/schema/workspace';

config({ path: '.env.local' });
config({ path: '.env' });

interface ImportSource {
  filePath: string;
  name: string;
}

interface ImportArguments {
  dryRun: boolean;
  email: string;
  sources: ImportSource[];
  workspaceId: string;
}

const args = parseArguments(process.argv.slice(2));

try {
  const target = await resolveTarget(args.email, args.workspaceId);
  const existingNames = new Set(
    (await listDocuments(target.userId))
      .filter((document) => document.workspaceId === target.workspaceId)
      .map((document) => document.name),
  );

  console.log(`Target: ${target.email} / ${target.workspaceName} (${target.workspaceId})`);

  for (const source of args.sources) {
    const payload = JSON.parse(await fs.readFile(source.filePath, 'utf8')) as unknown;
    const normalized = normalizePortableProjectExport(payload);
    const snapshot = validateDocumentSnapshot({
      ...normalized,
      kind: 'projectSnapshot',
    }) as ProjectExport;

    const summary = {
      assets: snapshot.project.assets.length,
      edges: snapshot.project.edges.length,
      kind: normalized.kind,
      nodes: snapshot.project.nodes.length,
      sections: snapshot.project.sections.length,
    };

    if (args.dryRun) {
      console.log(`VALID ${source.name}: ${JSON.stringify(summary)}`);
      continue;
    }

    if (existingNames.has(source.name)) {
      console.log(`SKIP ${source.name}: a document with this name already exists.`);
      continue;
    }

    const created = await createDocument({
      name: source.name,
      userId: target.userId,
      workspaceId: target.workspaceId,
    });

    try {
      const saved = await saveDocumentSnapshot({
        documentId: created.id,
        expectedRevision: created.revision,
        snapshot,
        userId: target.userId,
      });
      existingNames.add(source.name);
      console.log(`IMPORTED ${source.name}: ${saved.id} ${JSON.stringify(summary)}`);
    } catch (error) {
      await updateDocumentMetadata({
        documentId: created.id,
        status: 'trash',
        userId: target.userId,
      }).catch(() => undefined);
      await permanentlyDeleteDocument(target.userId, created.id).catch(() => undefined);
      throw error;
    }
  }
} finally {
  await getPostgresPool().end();
}

async function resolveTarget(email: string, workspaceId: string) {
  const [target] = await getDb().select({
    email: user.email,
    userId: user.id,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
  }).from(user)
    .innerJoin(membership, eq(membership.userId, user.id))
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .where(and(
      eq(user.email, email),
      eq(workspace.id, workspaceId),
    ))
    .limit(1);

  if (!target) {
    throw new Error(`No membership found for ${email} in workspace ${workspaceId}.`);
  }

  return target;
}

function parseArguments(argv: string[]): ImportArguments {
  let dryRun = false;
  let email = '';
  let workspaceId = '';
  const sources: ImportSource[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (argument === '--email') {
      email = argv[++index] ?? '';
      continue;
    }
    if (argument === '--workspace') {
      workspaceId = argv[++index] ?? '';
      continue;
    }

    const separatorIndex = argument.indexOf('::');
    if (separatorIndex <= 0) {
      throw usageError(`Invalid source "${argument}".`);
    }
    const name = argument.slice(0, separatorIndex).trim();
    const filePath = path.resolve(argument.slice(separatorIndex + 2));
    if (!name || !filePath) {
      throw usageError(`Invalid source "${argument}".`);
    }
    sources.push({ filePath, name });
  }

  if (!email || !workspaceId || sources.length === 0) {
    throw usageError('Email, workspace and at least one source are required.');
  }

  return { dryRun, email, sources, workspaceId };
}

function usageError(message: string) {
  return new Error(
    `${message}\n`
    + 'Usage: npm run import:legacy-projects -- '
    + '--email user@example.com --workspace UUID [--dry-run] '
    + '"Document name::/absolute/path/to/export.json"',
  );
}
