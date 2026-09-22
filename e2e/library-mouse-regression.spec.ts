import { gotoQaSection } from './release-user-fixture';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

const position = (page: Page) => page.locator('.image-viewer-dock-track').evaluate((track) =>
  -new DOMMatrix(getComputedStyle(track).transform).m41 / 96);

for (const scenario of ['mouse', 'window'] as const) {
  test(`Library ${scenario} regression: no recoil braking, stolen drags or phantom cards`, async ({ page, context, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost:3004');
    if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
    const owner = await createAudioQaOwner(origin.origin, `library-${scenario}-regression`);
    await context.addCookies(owner.http.browserSessionCookies());
    const items = Array.from({ length: 240 }, (_, index) => {
      const id = `019a2345-0000-7000-8000-${String(index).padStart(12, '0')}`;
      return { id, workspaceId: owner.workspaceId, document: null, originalName: `Mouse QA ${index}`,
        contentType: 'image/png', mediaKind: 'image', origin: 'uploaded', provider: null, modelId: null,
        operation: null, width: index % 2 ? 1600 : 900, height: index % 2 ? 900 : 1200,
        createdAt: new Date(0).toISOString(), contentUrl: `/api/assets/${id}/content`,
        thumbnailUrl: `/api/assets/${id}/content?variant=thumbnail` };
    });
    const picture = await sharp({ create: { width: 90, height: 120, channels: 3, background: '#645891' } }).png().toBuffer();
    let paidRequests = 0;
    await page.route('**/api/ai/**', (route) => {
      if (route.request().method() === 'GET') return route.continue();
      paidRequests++; return route.abort();
    });
    await page.route('**/api/assets?*', (route) => route.fulfill({ json: { items, nextCursor: null, facets: {} } }));
    await page.route('**/api/assets/*/content*', (route) => route.fulfill({ contentType: 'image/png', body: picture }));
    const carousel = page.locator('.image-viewer-carousel');
    const dock = page.locator('.image-viewer-dock');
    const idle = () => expect(page.locator('.image-viewer-content')).not.toHaveClass(/image-viewer-content-moving/);
    try {
      await gotoQaSection(page, '/library');
      await page.getByRole('link', { name: `Открыть Mouse QA ${scenario === 'mouse' ? 50 : 0}`, exact: true }).click();
      await expect(carousel).toBeVisible();
      await idle();
      if (scenario === 'window') {
        // Every mounted/visible card must be positioned, including before any
        // gesture at the first/last item. CSS defaults must never cover center.
        const placed = async () => {
          const cards = await carousel.locator('[data-carousel-index]').evaluateAll((elements) => elements.map((element) => {
            const card = element as HTMLElement;
            return { visible: getComputedStyle(card).visibility === 'visible', transform: card.style.transform };
          }));
          expect(cards.length).toBeLessThanOrEqual(9);
          expect(cards.length).toBe(9);
          expect(cards.every((card) => card.visible && card.transform.includes('translateX('))).toBe(true);
          await expect(page.getByRole('dialog', { name: 'Image viewer', exact: true })).toHaveCount(1);
        };
        await placed();
        for (const key of ['Home', 'End', 'Home']) {
          await carousel.focus(); await page.keyboard.press(key); await idle();
          await placed();
          const box = (await carousel.boundingBox())!;
          const direction = key === 'End' ? -1 : 1;
          await page.mouse.move(box.width / 2, box.y + box.height / 2); await page.mouse.down();
          for (let step = 1; step <= 6; step++) {
            await page.mouse.move(box.width / 2 - direction * step * 30, box.y + box.height / 2);
            await placed();
          }
          await page.mouse.up(); await idle(); await placed();
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await carousel.focus(); await page.keyboard.press('End'); await idle(); await placed();
        await carousel.focus(); await page.keyboard.press('Home'); await idle(); await placed();
      } else {
        const clockStart = Date.now();
        await page.clock.install({ time: new Date(clockStart) });
        await page.clock.pauseAt(new Date(clockStart + 60_000));
        for (const surface of [carousel, dock]) {
          const speeds: number[] = [];
          for (let repeat = 0; repeat < 20; repeat++) {
            const box = (await surface.boundingBox())!;
            const x = box.x + box.width / 2; const y = box.y + box.height / 2;
            await page.mouse.move(x, y); await page.mouse.down();
            for (let step = 1; step <= 5; step++) {
              await page.clock.runFor(16); await page.mouse.move(x - step * 4, y);
            }
            // The old calculation discarded the whole swipe for this 1px recoil.
            await page.clock.runFor(8); await page.mouse.move(x - 19, y); await page.mouse.up();
            await page.clock.runFor(16);
            const released = await position(page);
            await page.clock.runFor(48);
            speeds.push((await position(page) - released) / 0.048);
          }
          expect(speeds.every((speed) => speed > 0.02)).toBe(true);
          expect(speeds[1]!).toBeGreaterThan(speeds[0]! * 1.1);
          expect(speeds[2]!).toBeGreaterThan(speeds[0]! * 1.1);
          console.info('20 mouse flicks with recoil', { surface: surface === carousel ? 'main' : 'dock', min: Math.min(...speeds) });
          await page.clock.runFor(4000); await idle();
        }
        // The arrow hit area is also a drag surface. A release must not click it.
        for (const side of ['next', 'prev']) {
          const arrow = carousel.locator(`.image-viewer-nav-${side}`);
          const box = (await arrow.boundingBox())!;
          const x = box.x + box.width / 2; const y = box.y + box.height / 2;
          const direction = side === 'next' ? 1 : -1;
          const before = await position(page);
          await page.mouse.move(x, y); await page.mouse.down();
          for (let step = 1; step <= 5; step++) {
            await page.clock.runFor(16); await page.mouse.move(x - direction * step * 10, y);
          }
          await expect(carousel).toHaveAttribute('data-dragging', 'true');
          await page.mouse.up(); await page.clock.runFor(16);
          const released = await position(page);
          await page.clock.runFor(64);
          expect((released - before) * direction).toBeGreaterThan(0.01);
          expect((await position(page) - released) * direction).toBeGreaterThan(0.001);
          // A plain arrow click still works even while the gallery coasts.
          const selected = Math.round(await position(page));
          await arrow.click(); await page.clock.runFor(4000); await idle();
          expect(await position(page)).toBeCloseTo(selected + direction, 3);
          await arrow.focus(); await page.keyboard.press('Enter'); await page.clock.runFor(4000);
          expect(await position(page)).toBeCloseTo(selected + direction * 2, 3);
        }
        // Real wheel events use the unchanged trackpad path. No extra coast or
        // centering may be added when the OS event sequence ends.
        for (const surface of [carousel, dock]) {
          const box = (await surface.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          const before = await position(page);
          for (const delta of [60, 40, 20, 10, 3, 1]) {
            await page.mouse.wheel(delta, 0); await page.clock.runFor(32);
          }
          const released = await position(page);
          expect(released).toBeGreaterThan(before);
          await page.clock.runFor(1000); await idle();
          expect(await position(page)).toBeCloseTo(released, 4);
        }
      }
      expect(paidRequests).toBe(0);
    } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
  });
}
