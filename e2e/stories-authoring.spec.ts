import { expect, test } from '@playwright/test';
import { Pool } from 'pg';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });
test('Stories: visual creation, independent Timeline, persisted blueprint and card menu', async ({ page, context, baseURL }) => {
  test.skip(process.env.STORIES_LOCAL_E2E !== '1', 'Explicit local Stories QA required; fixture needs enabled test registration.');
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (!['localhost', '127.0.0.1'].includes(origin.hostname) || !process.env.STORIES_TEST_DATABASE_URL || !['localhost', '127.0.0.1'].includes(new URL(process.env.STORIES_TEST_DATABASE_URL).hostname)) throw Error('Explicit local test environment required');
  const owner = await createAudioQaOwner(origin.origin, 'stories'); await context.addCookies(owner.http.browserSessionCookies());
  let storyId: string | undefined; let timelineId: string | undefined;
  await page.route('**/api/chat/v1/conversations/*/turn*', (route) => route.abort());
  try {
    await page.goto('/stories'); await page.getByRole('button', { name: 'Новая история', exact: true }).click();
    await page.getByRole('button', { name: /Shorts/ }).click(); await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await page.getByRole('button', { name: /Комедия/ }).click(); await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await page.getByLabel('Название истории', { exact: true }).fill('Stories UI QA');
    await expect(page.locator('dialog select')).toHaveCount(0);
    await page.getByRole('button', { name: 'Создать Storyboard', exact: true }).click();
    await expect(page).toHaveURL(/\/stories\/[^/?]+\?view=blueprint$/); storyId = new URL(page.url()).pathname.split('/').at(-1)!;
    await page.getByLabel('Сценарий', { exact: true }).fill('Самостоятельный сценарий.'); await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /^Сохранено$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Свернуть соавтора' }).click(); await expect(page.getByRole('button', { name: 'Развернуть соавтора' })).toBeVisible();
    await page.getByRole('link', { name: '← Stories', exact: true }).click(); await page.getByRole('button', { name: 'Новый Timeline', exact: true }).click();
    await page.getByLabel('Название монтажа').fill('Timeline UI QA'); await page.getByRole('button', { name: 'Создать Timeline', exact: true }).click();
    await expect(page).toHaveURL(/\/stories\/timelines\/[^/?]+$/); timelineId = new URL(page.url()).pathname.split('/').at(-1)!;
    expect(timelineId).not.toBe(storyId); await expect(page.getByText('Самостоятельный документ', { exact: true })).toBeVisible();
    await page.getByLabel('Название монтажа').fill('Timeline UI QA renamed'); await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /^Сохранено$/ })).toBeVisible();
    const story = (await (await owner.http.request(`/api/stories/${storyId}`)).json()).story;
    const timeline = (await (await owner.http.request(`/api/stories/timelines/${timelineId}`)).json()).timeline;
    expect(story.snapshot.blueprint.script).toBe('Самостоятельный сценарий.'); expect(story.snapshot.timeline).toBeUndefined(); expect(story.revision).toBe(1); expect(timeline.storyboardId).toBeNull();
    await page.getByRole('link', { name: '← Stories', exact: true }).click(); await page.getByRole('button', { name: 'Действия: Timeline UI QA renamed' }).click(); await expect(page.getByRole('button', { name: 'Переименовать или переместить' })).toBeVisible();
  } finally {
    const pool = new Pool({ connectionString: process.env.STORIES_TEST_DATABASE_URL });
    try {
      if (timelineId) await pool.query('delete from story_timeline where id=$1 and workspace_id=$2', [timelineId, owner.workspaceId]);
      if (storyId) { await pool.query('delete from chat_conversations where id in (select conversation_id from story_chat_conversation where storyboard_id=$1)', [storyId]); await pool.query('delete from story_project where id=$1 and workspace_id=$2', [storyId, owner.workspaceId]); }
      const fixture = (await pool.query('select u.id from "user" u join workspace w on w.created_by_user_id=u.id where w.id=$1 and u.name=$2 and u.email like $3', [owner.workspaceId, 'Audio Runtime QA stories', '%@example.test'])).rows[0];
      if (fixture) { await pool.query('delete from workspace where id=$1 and created_by_user_id=$2', [owner.workspaceId, fixture.id]); await pool.query('delete from "user" where id=$1', [fixture.id]); }
    } finally { await pool.end(); }
  }
});
