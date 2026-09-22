import { createTimeline, getTimeline, saveTimeline } from './timeline-service';
import { emptyTimeline } from '../contracts/story-timeline';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/shared/db/schema';
import { user } from '@/shared/db/schema/auth';
import { membership, workspace } from '@/shared/db/schema/workspace';
import { studioFolder } from '@/shared/db/schema/studio-folder';
import { subjectProfile } from '@/shared/db/schema/subject-profile';
import { emptySubjectProfile } from '@/entities/production-graph/model/subject-profile';
import { createStorySnapshot, settingsForFormat } from '../core/story-presets';
import { createStory, getStory, listStories, saveStory } from './story-service';

const databaseUrl = process.env.STORIES_TEST_DATABASE_URL;
test('PostgreSQL: authoring persists, rejects stale writes and isolates workspace/folder access', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl }); const db = drizzle(pool, { schema });
  const rollback = new Error('story_test_rollback');
  const owner = randomUUID(), other = randomUUID(), first = randomUUID(), second = randomUUID(), folderId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      // A missing new table is created only inside this rolled-back transaction.
      const found = await tx.execute(sql`select to_regclass('public.story_project') as table_name`);
      if (!found.rows[0]?.table_name) {
        const migration = await readFile('drizzle/0033_story_projects.sql', 'utf8');
        for (const statement of migration.split('--> statement-breakpoint')) await tx.execute(sql.raw(statement));
      }
      if (!(await tx.execute(sql`select to_regclass('public.story_timeline') as table_name`)).rows[0]?.table_name) {
        for (const statement of (await readFile('drizzle/0035_story_documents.sql', 'utf8')).split('--> statement-breakpoint')) await tx.execute(sql.raw(statement));
      }
      await tx.insert(user).values([owner, other].map((id) => ({ id, name: 'Stories test fixture', termsAcceptedAt: new Date(), termsVersion: 'test-fixture' })));
      await tx.insert(workspace).values([{ id: first, name: 'First', createdByUserId: owner }, { id: second, name: 'Second', createdByUserId: other }]);
      await tx.insert(membership).values([{ workspaceId: first, userId: owner, role: 'owner' }, { workspaceId: second, userId: other, role: 'owner' }]);
      await tx.insert(studioFolder).values({ id: folderId, workspaceId: second, createdByUserId: other, name: 'Other folder' });
      const input = { name: 'Saved story', folderId: null, snapshot: createStorySnapshot(settingsForFormat('advert')) };
      const created = await createStory(owner, first, input, tx);
      assert.equal((await getStory(owner, created.id, tx)).name, 'Saved story');
      assert.equal((await listStories(owner, first, tx)).length, 1);
      assert.equal((await listStories(other, second, tx)).length, 0);
      await assert.rejects(getStory(other, created.id, tx), /не найдена/);
      await assert.rejects(listStories(other, first, tx), /Workspace access denied/);
      await assert.rejects(createStory(owner, first, { ...input, folderId }, tx), /folder unavailable/);
      const creationId = randomUUID();
      const firstAttempt = await createStory(owner, first, input, tx, creationId);
      const retried = await createStory(owner, first, { ...input, name: 'Must not overwrite' }, tx, creationId);
      assert.equal(firstAttempt.id, creationId); assert.equal(retried.id, firstAttempt.id);
      assert.equal(retried.name, input.name);
      await assert.rejects(createStory(other, second, input, tx, creationId), /восстановить создание/);
      const timelineCreationId = randomUUID();
      const timelineInput = { name: 'First montage', folderId: null, storyboardId: null, snapshot: emptyTimeline() };
      const firstTimeline = await createTimeline(owner, first, timelineInput, tx, timelineCreationId);
      const repeatTimeline = await createTimeline(owner, first, timelineInput, tx, timelineCreationId);
      assert.equal(firstTimeline.id, repeatTimeline.id);
      await assert.rejects(createTimeline(other, second, timelineInput, tx, timelineCreationId), /восстановить создание/);
      const ownSubject = randomUUID(), foreignSubject = randomUUID();
      await tx.insert(subjectProfile).values([
        { id: ownSubject, workspaceId: first, createdByUserId: owner, payload: { ...emptySubjectProfile, name: 'Own character' } },
        { id: foreignSubject, workspaceId: second, createdByUserId: other, payload: { ...emptySubjectProfile, name: 'Foreign character' } },
      ]);
      const withCharacter = await createStory(owner, first, { ...input, snapshot: { ...input.snapshot, subjectIds: [ownSubject] } }, tx);
      assert.deepEqual((await getStory(owner, withCharacter.id, tx)).snapshot.subjectIds, [ownSubject]);
      await assert.rejects(saveStory(owner, withCharacter.id, 0, { ...input, snapshot: { ...input.snapshot, subjectIds: [foreignSubject] } }, tx), /Герой недоступен/);
      assert.deepEqual((await getStory(owner, withCharacter.id, tx)).snapshot.subjectIds, [ownSubject]);
      const changed = { ...input, snapshot: { ...input.snapshot, blueprint: { ...input.snapshot.blueprint, script: 'My script' } } };
      const saved = await saveStory(owner, created.id, 0, changed, tx);
      assert.equal(saved.revision, 1); assert.equal(saved.snapshot.blueprint.script, 'My script');
      await assert.rejects(saveStory(owner, created.id, 0, input, tx), /другой вкладке/);
      assert.equal((await getStory(owner, created.id, tx)).snapshot.blueprint.script, 'My script');
      const standalone = await createTimeline(owner, first, { name: 'Standalone', folderId: null, storyboardId: null, snapshot: emptyTimeline() }, tx);
      const linked = await createTimeline(owner, first, { name: 'Linked', folderId: null, storyboardId: created.id, snapshot: emptyTimeline() }, tx);
      assert.notEqual(linked.id, created.id); assert.equal(standalone.storyboardId, null);
      await saveTimeline(owner, linked.id, 0, { name: 'Independent edit', folderId: null, storyboardId: created.id, snapshot: { ...emptyTimeline(), aspectRatio: '1:1' } }, tx);
      assert.equal((await getStory(owner, created.id, tx)).revision, 1);
      await assert.rejects(getTimeline(other, linked.id, tx), /не найден/);
      await assert.rejects(createTimeline(other, second, { name: 'Foreign', folderId: null, storyboardId: created.id, snapshot: emptyTimeline() }, tx), /не найдена/);
      await assert.rejects(saveTimeline(owner, linked.id, 0, { name: 'Stale', folderId: null, storyboardId: null, snapshot: emptyTimeline() }, tx), /другой вкладке/);
      await tx.delete(membership).where(eq(membership.userId, owner));
      await assert.rejects(getStory(owner, created.id, tx), /не найдена/);
      await assert.rejects(saveStory(owner, created.id, 1, input, tx), /не найдена/);
      await assert.rejects(getTimeline(owner, linked.id, tx), /не найден/);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await pool.end(); }
});
