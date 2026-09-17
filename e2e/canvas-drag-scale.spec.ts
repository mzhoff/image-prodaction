import { expect, test } from '@playwright/test';
import { createDefaultNode } from '../src/entities/production-graph/model/create-default-node';
import { initialProject } from '../src/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState } from '../src/entities/production-graph/model/project-schema';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1600, height: 1100 } });

test('50-card graph keeps 120 pointer steps outside persistence and preserves all other coordinates', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Canvas QA is local-only.');
  const owner = await createAudioQaOwner(origin.origin, 'canvas-scale');
  await context.addCookies(owner.http.browserSessionCookies());
  const nodes = Array.from({ length: 50 }, (_, index) => createDefaultNode(
    index % 3 === 0 ? 'generateImage' : index % 3 === 1 ? 'importImage' : 'textPrompt',
    { x: (index % 10) * 450, y: Math.floor(index / 10) * 900 },
  ));
  const state = { ...structuredClone(initialProject), nodes, assets: [], edges: [], uiState: createEmptyProjectUiState() };
  await page.addInitScript((seed: string) => {
    localStorage.setItem('reverie-image-production-project:v1', seed);
    const counters = { writes: 0, times: [] as number[], measuring: false };
    Object.assign(window, { canvasScaleQa: counters });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('reverie-image-production-project:')) counters.writes++;
      return original.call(this, key, value);
    };
    let last = 0;
    const frame = (now: number) => {
      if (counters.measuring && last) counters.times.push(now - last);
      last = counters.measuring ? now : 0;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, JSON.stringify({ state, version: 0 }));
  try {
    await page.goto('/editor');
    await expect(page.locator('[data-node-id]')).toHaveCount(50);
    await page.waitForTimeout(1_000);
    const card = page.locator(`[data-node-id="${nodes[22].id}"]`);
    const rect = (await card.boundingBox())!;
    const zoom = rect.width / nodes[22].size.width;
    const x = rect.x + 35 * zoom;
    const y = rect.y + 20 * zoom;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.waitForTimeout(100);
    const beforeDrag = await page.evaluate(() => JSON.parse(localStorage.getItem('reverie-image-production-project:v1')!).state);
    const start = await page.evaluate(() => {
      const counters = (window as unknown as { canvasScaleQa: { writes: number; measuring: boolean } }).canvasScaleQa;
      counters.measuring = true;
      return counters.writes;
    });
    await page.mouse.move(x + 80, y + 40, { steps: 120 });
    await expect(card).toHaveAttribute('style', /transform: translate/);
    const metrics = await page.evaluate(() => {
      const counters = (window as unknown as { canvasScaleQa: { writes: number; measuring: boolean; times: number[] } }).canvasScaleQa;
      counters.measuring = false;
      const times = [...counters.times].sort((a, b) => a - b);
      return { writes: counters.writes, frames: times.length, p95FrameMs: times[Math.floor(times.length * 0.95)],
        over50ms: times.filter((value) => value > 50).length };
    });
    expect(metrics.writes).toBe(start);
    await page.mouse.up();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('reverie-image-production-project:v1')!).state);
    expect(saved.nodes[22].position).not.toEqual(nodes[22].position);
    expect(saved.nodes.filter((_: unknown, index: number) => index !== 22)).toEqual(beforeDrag.nodes.filter((_: unknown, index: number) => index !== 22));
    console.log('Synthetic 50-card drag:', JSON.stringify({ ...metrics, writesDuringDrag: metrics.writes - start }));
  } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
});
