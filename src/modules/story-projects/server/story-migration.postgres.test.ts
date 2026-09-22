import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
const url = process.env.STORIES_TEST_DATABASE_URL;
test('migration extracts legacy montage without losing blueprint, clips or original snapshot', { skip: !url }, async () => {
  const pool = new Pool({ connectionString: url }); const client = await pool.connect();
  try {
    await client.query('begin');
    // Isolate migration tables in a transaction-local schema; public user/workspace FKs remain valid.
    const namespace = `story_migration_${randomUUID().replaceAll('-', '')}`;
    await client.query(`create schema "${namespace}"`); await client.query(`set local search_path to "${namespace}", public`);
    const owner = randomUUID(), workspaceId = randomUUID(), storyId = randomUUID();
    await client.query('insert into public."user" (id,name,terms_accepted_at,terms_version) values ($1,$2,now(),$3)', [owner,'Stories migration fixture','test-fixture']);
    await client.query('insert into public.workspace (id,name,created_by_user_id) values ($1,$2,$3)', [workspaceId,'Migration fixture',owner]);
    for(const statement of (await readFile('drizzle/0033_story_projects.sql','utf8')).split('--> statement-breakpoint')) await client.query(statement);
    const original = { schemaVersion: 1, settings: { aspectRatio: '9:16' }, blueprint: { script: 'Keep this script' }, scenes: [], timeline: { clips: [{ id: randomUUID(), assetId: randomUUID(), sourceInMs: 600, durationMs: 4200 }] } };
    await client.query('insert into story_project (id,workspace_id,created_by_user_id,name,snapshot,revision) values ($1,$2,$3,$4,$5,7)', [storyId,workspaceId,owner,'Original',original]);
    for(const statement of (await readFile('drizzle/0035_story_documents.sql','utf8')).split('--> statement-breakpoint')) await client.query(statement);
    const story = (await client.query('select * from story_project where id=$1',[storyId])).rows[0];
    const timeline = (await client.query('select * from story_timeline where id=$1',[storyId])).rows[0];
    const backup = (await client.query('select * from story_v1_migration_backup where storyboard_id=$1',[storyId])).rows[0];
    assert.equal(story.snapshot.schemaVersion,2); assert.equal(story.snapshot.timeline,undefined); assert.equal(story.snapshot.blueprint.script,original.blueprint.script); assert.equal(story.revision,8);
    assert.deepEqual(timeline.snapshot.clips,original.timeline.clips); assert.equal(timeline.storyboard_id,storyId); assert.equal(timeline.snapshot.aspectRatio,'9:16');
    assert.deepEqual(backup.snapshot,original); assert.equal(backup.revision,7);
  } finally { await client.query('rollback'); client.release(); await pool.end(); }
});
