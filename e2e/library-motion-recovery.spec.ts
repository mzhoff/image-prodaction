import { gotoQaSection } from './release-user-fixture';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

for (const scenario of ['pagination', 'interruption', 'acceleration'] as const) {
  test(`Library swipe retains its live position during ${scenario}`, async ({ page, context, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost:3004');
    if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
    const owner = await createAudioQaOwner(origin.origin, `library-${scenario}`);
    await context.addCookies(owner.http.browserSessionCookies());
    const items = Array.from({ length: 80 }, (_, index) => {
      const id = `019a2345-0000-7000-8000-${String(index).padStart(12, '0')}`;
      return { id, workspaceId: owner.workspaceId, document: null, originalName: `Motion QA ${index}`,
        contentType: 'image/png', mediaKind: 'image', origin: 'uploaded', provider: null, modelId: null,
        operation: null, width: 900, height: 1200, createdAt: new Date(0).toISOString(),
        contentUrl: `/api/assets/${id}/content`, thumbnailUrl: `/api/assets/${id}/content?variant=thumbnail` };
    });
    const picture = await sharp({ create: { width: 90, height: 120, channels: 3, background: '#645891' } }).png().toBuffer();
    let allowPage = () => {};
    const nextPage = new Promise<void>((resolve) => { allowPage = resolve; });
    let paginationRequested = false;
    let paidRequests = 0;
    await page.route('**/api/ai/**', (route) => {
      if (route.request().method() === 'GET') return route.continue();
      paidRequests++; return route.abort();
    });
    await page.route('**/api/assets?*', async (route) => {
      const cursor = new URL(route.request().url()).searchParams.get('cursor');
      if (cursor) { paginationRequested = true; await nextPage; }
      await route.fulfill({ json: { items: cursor ? items.slice(40) : items.slice(0, 40),
        nextCursor: !cursor && scenario === 'pagination' ? 'next-page' : null, facets: {} } });
    });
    await page.route('**/api/assets/*/content*', (route) => route.fulfill({ contentType: 'image/png', body: picture }));
    const dock = page.locator('.image-viewer-dock');
    const carousel = page.locator('.image-viewer-carousel');
    const position = () => dock.locator('.image-viewer-dock-track').evaluate((track) => -new DOMMatrix(getComputedStyle(track).transform).m41 / 96);
    const idle = () => expect(page.locator('.image-viewer-content')).not.toHaveClass(/image-viewer-content-moving/);
    const selected = async (index: number, restingPosition = index) => {
      await idle();
      await expect(page).toHaveURL(`${origin.origin}/library/${items[index]!.id}`);
      await expect.poll(position).toBeCloseTo(restingPosition, 3);
      await expect(page.getByRole('dialog', { name: 'Image viewer', exact: true })).toHaveCount(1);
    };
    try {
      // Real grid -> intercepted viewer, not only a direct asset URL.
      await gotoQaSection(page, '/library');
      await page.getByRole('link', { name: 'Открыть Motion QA 5', exact: true }).click();
      await expect(dock).toBeVisible();
      await selected(5);
      if (scenario === 'acceleration') {
        // Keep input timing identical: otherwise a slower second automation
        // gesture could accidentally pass as a test of momentum accumulation.
        const clockStart = Date.now();
        await page.clock.install({ time: new Date(clockStart) });
        await page.clock.pauseAt(new Date(clockStart + 60_000));
        const flick = async (surface: typeof carousel, direction = 1, hold = 0) => {
          const box = (await surface.boundingBox())!;
          const x = box.x + box.width / 2; const y = box.y + box.height / 2;
          await page.mouse.move(x, y); await page.mouse.down();
          if (hold) await page.clock.runFor(hold);
          for (let step = 1; step <= 5; step++) {
            await page.clock.runFor(16);
            await page.mouse.move(x - direction * step * 4, y);
          }
          await page.mouse.up();
          await page.clock.runFor(16); // Flush the last drag paint before measuring coast.
          const released = await position();
          await page.clock.runFor(48);
          return (await position() - released) / 0.048;
        };
        for (const surface of [carousel, dock]) {
          // Click centers only on explicit selection; leave plenty of room.
          await dock.locator('[data-dock-index="5"]').click();
          await page.clock.runFor(2500);
          const first = await flick(surface);
          const second = await flick(surface);
          const third = await flick(surface);
          console.info('Same-direction fling speeds', { surface: surface === dock ? 'dock' : 'main', first, second, third });
          expect(first).toBeGreaterThan(0);
          expect(second).toBeGreaterThan(first * 1.15);
          expect(third).toBeGreaterThan(second * 1.05);
          const opposite = await flick(surface, -1);
          expect(opposite).toBeLessThan(third);
          // Holding is an intentional stop, not a delayed acceleration.
          await page.mouse.down(); await page.clock.runFor(500); await page.mouse.up();
          await page.clock.runFor(1000);
          const stopped = await position();
          await page.clock.runFor(500);
          expect(await position()).toBeCloseTo(stopped, 4);
          // A long press BEFORE moving must not dilute a subsequent flick.
          const heldStart = await flick(surface, 1, 800);
          expect(heldStart).toBeGreaterThan(first * 0.8);
          await page.clock.runFor(4000);
        }
        expect(paidRequests).toBe(0);
        return;
      }
      await page.mouse.move(720, 126); await page.mouse.down();
      await page.mouse.move(432, 126, { steps: 24 });
      await expect.poll(position).toBeCloseTo(8, 2);
      if (scenario === 'pagination') {
        expect(paginationRequested).toBe(true);
        allowPage();
        await expect(page.locator('.image-viewer-version-badge')).toHaveText('9/80');
        // Appending files cannot cancel a held pointer or reset to entry item 5.
        await expect.poll(position).toBeCloseTo(8, 2);
        await expect(dock).toHaveAttribute('data-dragging', 'true');
        await page.waitForTimeout(350); await page.mouse.up();
        await selected(8);
      } else {
        // A cancellation from the other surface does not own this gesture.
        await carousel.dispatchEvent('pointercancel', { pointerId: 999, isPrimary: true });
        await expect.poll(position).toBeCloseTo(8, 2);
        // Losing focus should settle here, never roll back to the opening image.
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.mouse.up();
        await selected(8);
        await dock.evaluate((element) => element.addEventListener('pointerdown', (event) => {
          (element as HTMLElement).dataset.qaPointerId = String((event as PointerEvent).pointerId);
        }, { once: true }));
        await page.mouse.move(720, 126); await page.mouse.down();
        await page.mouse.move(528, 126, { steps: 16 });
        await expect.poll(position).toBeCloseTo(10, 2);
        await dock.dispatchEvent('pointercancel', { pointerId: Number(await dock.getAttribute('data-qa-pointer-id')), isPrimary: true });
        await page.mouse.up();
        await selected(10);
        await page.mouse.move(720, 126); await page.mouse.down();
        await page.mouse.move(528, 126, { steps: 16 });
        await expect.poll(position).toBeCloseTo(12, 2);
        await page.setViewportSize({ width: 1300, height: 900 });
        // Viewport command completion precedes the browser's resize event.
        await expect(dock).not.toHaveAttribute('data-dragging', 'true');
        await page.mouse.up();
        await selected(12);
      }
      // A second swipe before the first coast has settled continues from the
      // live track position, not from the URL's last acknowledged selection.
      for (let repeat = 0; repeat < 3; repeat++) {
        const before = await position();
        await page.mouse.move(650, 126); await page.mouse.down();
        await page.mouse.move(540, 126, { steps: 5 }); await page.mouse.up();
        await expect.poll(position).toBeGreaterThan(before + 0.75);
      }
      await idle();
      const finalIndex = Math.round(await position());
      expect(finalIndex).toBeGreaterThan(scenario === 'pagination' ? 8 : 12);
      await selected(finalIndex, await position());
      // Native diagonal touch must not be stolen by vertical scrolling of the
      // locked page (which would dispatch pointercancel in the old pan-y mode).
      const cdp = await context.newCDPSession(page);
      for (const surface of [dock, carousel]) {
        const before = await position();
        const box = (await surface.locator('[aria-current="true"]').boundingBox())!;
        const x = box.x + box.width / 2; const y = box.y + box.height / 2;
        const distance = Math.min(100, box.width * 0.6);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - distance, y: y + distance * 1.5 }] });
        await expect(surface).toHaveAttribute('data-dragging', 'true');
        const held = await position();
        expect(held).toBeGreaterThan(before);
        await page.waitForTimeout(350);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await selected(Math.round(held), held);
      }
      // Selection persists across a reload; it no longer depends on entry props.
      const selectedUrl = page.url();
      const reloadIndex = Math.round(await position());
      await page.reload();
      await expect(dock).toBeVisible();
      await expect(page).toHaveURL(selectedUrl);
      await selected(reloadIndex);
      expect(paidRequests).toBe(0);
    } finally {
      allowPage();
      await owner.http.request('/api/auth/sign-out', { json: {} });
    }
  });
}
