import { storyTimeline } from '@/shared/db/schema/story-timeline';
import { and, count, desc, eq } from 'drizzle-orm';
import { requireStudioFolder } from '@/entities/workspace/server/studio-folder-service';
import { decodeLibraryCursor, encodeLibraryCursor, normalizeLibrarySearch } from '@/entities/asset/server/asset-normalization';
import { getDb } from '@/shared/db/client';
import { asset } from '@/shared/db/schema/asset';
import { storyProject } from '@/shared/db/schema/story-project';
import { storyAssetRequirements } from '@/modules/story-projects/core/story-editing';
import { timelineAssetRequirements } from '@/modules/story-projects/core/timeline-media';
import type { ProjectContents, ProjectMedia } from '../contracts/project-contents';
import { projectMediaConditions } from './project-media-query';

const PAGE_SIZE = 48;

export async function getProjectContents(userId: string, workspaceId: string, folderId: string,
  options: { cursor?: string | null; search?: string } = {}): Promise<ProjectContents> {
  await requireStudioFolder(userId, workspaceId, folderId);
  const rows = await getDb().select().from(storyProject)
    .where(and(eq(storyProject.workspaceId, workspaceId), eq(storyProject.folderId, folderId)))
    .orderBy(desc(storyProject.updatedAt));
  const timelines = await getDb().select().from(storyTimeline).where(and(eq(storyTimeline.workspaceId, workspaceId), eq(storyTimeline.folderId, folderId))).orderBy(desc(storyTimeline.updatedAt));
  const storyAssetIds = [...new Set([...rows.flatMap((row) => storyAssetRequirements(row.snapshot).map((item) => item.id)), ...timelines.flatMap((row) => timelineAssetRequirements(row.snapshot).map((item) => item.id))])];
  const filters = { workspaceId, folderId, storyAssetIds, search: normalizeLibrarySearch(options.search) };
  const [mediaRows, totals] = await Promise.all([
    getDb().select({ id: asset.id, workspaceId: asset.workspaceId, name: asset.originalName,
      kind: asset.mediaKind, createdAt: asset.createdAt }).from(asset)
      .where(and(...projectMediaConditions({ ...filters, cursor: decodeLibraryCursor(options.cursor) })))
      .orderBy(desc(asset.createdAt), desc(asset.id)).limit(PAGE_SIZE + 1),
    getDb().select({ total: count() }).from(asset).where(and(...projectMediaConditions(filters))),
  ]);
  const page = mediaRows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    timelines: timelines.map(({ snapshot: _snapshot, createdByUserId: _author, ...row }) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })),
    stories: rows.map((story) => ({ id: story.id, workspaceId: story.workspaceId, folderId: story.folderId,
      name: story.name, revision: story.revision, createdAt: story.createdAt.toISOString(), updatedAt: story.updatedAt.toISOString(),
    })),
    media: page.map((item): ProjectMedia => ({ ...item, createdAt: item.createdAt.toISOString(),
      contentUrl: `/api/assets/${item.id}/content`,
      ...(item.kind !== 'audio' ? { thumbnailUrl: `/api/assets/${item.id}/content?variant=thumbnail` } : {}),
    })),
    mediaTotal: totals[0]?.total ?? 0,
    nextCursor: mediaRows.length > PAGE_SIZE && last ? encodeLibraryCursor(last) : null,
  };
}
