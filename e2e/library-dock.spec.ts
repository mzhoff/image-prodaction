import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

test('Library dock: centered, full width, drag-to-select, bounded thumbnails and keyboard/touch', async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(100_000);
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'library-dock');
  await context.addCookies(owner.http.browserSessionCookies());
  // Synthetic browser collection tests 200 items without creating 200 stored user assets.
  const items = Array.from({ length: 200 }, (_, index) => {
    const id = `019a1234-0000-7000-8000-${String(index).padStart(12, '0')}`;
    return { id, workspaceId: owner.workspaceId, document: null, originalName: `Кадр ${index + 1}`,
      contentType: 'image/png', mediaKind: 'image', origin: 'uploaded', provider: null, modelId: null,
      operation: null, width: index % 2 ? 900 : 1600, height: index % 2 ? 1600 : 900,
      createdAt: new Date(0).toISOString(), contentUrl: `/api/assets/${id}/content`, thumbnailUrl: `/api/assets/${id}/content?variant=thumbnail` };
  });
  const colors = ['#546a86', '#bf9361', '#7f8272', '#705d80', '#4d8b88', '#b67878'];
  const pictures = await Promise.all(colors.map((color, i) => sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${i % 2 ? 180 : 480}" height="${i % 2 ? 320 : 270}" viewBox="0 0 480 320" preserveAspectRatio="none"><rect width="480" height="320" fill="${color}"/><circle cx="240" cy="150" r="65" fill="#ffffff40"/><text x="240" y="175" fill="white" text-anchor="middle" font-size="64">${i + 1}</text></svg>`,
  )).png().toBuffer()));
  let originals = 0;
  const originalRequests: string[] = [];
  let paidRequests = 0;
  await page.route('**/api/ai/**', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    paidRequests++; return route.abort();
  });
  await page.route('**/api/assets?*', (route) => route.fulfill({ json: { items, nextCursor: null, facets: {} } }));
  await page.route('**/api/assets/*/content*', (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has('variant')) { originals++; originalRequests.push(url.pathname); }
    const index = Number(url.pathname.split('/')[3]!.slice(-12));
    return route.fulfill({ contentType: 'image/png', body: pictures[index % pictures.length] });
  });
  const dock = page.getByRole('region', { name: 'Лента изображений — перетащите для выбора' });
  const active = dock.locator('[aria-current="true"]');
  const centered = async (width: number) => {
    await expect.poll(async () => {
      const box = await active.boundingBox();
      return Math.abs((box?.x ?? -1000) + (box?.width ?? 0) / 2 - width / 2);
    }).toBeLessThan(1.5);
  };
  try {
    await page.goto(`/library/${items[100]!.id}`);
    await expect(dock).toBeVisible();
    await centered(1440);
    expect(await dock.boundingBox()).toMatchObject({ x: 0, y: 76, width: 1440, height: 104 });
    const headerColor = await page.locator('.image-viewer-content-with-dock').evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
    expect(await dock.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(headerColor);
    expect(await dock.locator('img').count()).toBeLessThanOrEqual(23);
    const closeBox = await page.locator('.image-viewer-close').boundingBox();
    expect(closeBox!.y + closeBox!.height).toBeLessThan(76);
    expect((await page.locator('.image-viewer-media').boundingBox())!.y).toBeGreaterThanOrEqual(180);
    const imageBox = await page.locator('.image-viewer-media').boundingBox();
    expect(imageBox!.y + imageBox!.height).toBeLessThanOrEqual((await page.locator('.image-editor-panel').boundingBox())!.y);
    const sizes = await dock.locator('[data-dock-index]').evaluateAll((tiles) => tiles.map((tile) => ({
      i: Number((tile as HTMLElement).dataset.dockIndex), width: tile.getBoundingClientRect().width,
    })));
    expect(sizes.find((s) => s.i === 100)!.width).toBe(sizes.find((s) => s.i === 101)!.width);
    expect(sizes.find((s) => s.i === 101)!.width).toBe(sizes.find((s) => s.i === 102)!.width);
    expect(sizes.find((s) => s.i === 99)!.width).toBeCloseTo(sizes.find((s) => s.i === 101)!.width, 1);
    await page.screenshot({ path: testInfo.outputPath('library-dock-desktop.png') });
    const before = originals;
    await page.mouse.move(720, 126);
    await page.mouse.down();
    await page.mouse.move(720 - 96 * 3, 126, { steps: 35 });
    await expect(dock).toHaveAttribute('data-dragging', 'true');
    await expect(page).toHaveURL(`${origin.origin}/library/${items[100]!.id}`);
    expect(originalRequests.slice(before), 'No original requests while dragging').toEqual([]);
    // Holding still before release intentionally removes momentum.
    await page.waitForTimeout(350);
    await page.mouse.up();
    await expect(page).toHaveURL(`${origin.origin}/library/${items[103]!.id}`);
    await centered(1440);
    // Next Image may normalize the HTML attribute after attaching its error handler.
    // Compare the resolved URL, not relative-vs-absolute serialization.
    await expect(page.locator('.image-viewer-media')).toHaveJSProperty('src', new URL(items[103]!.contentUrl, origin).href);
    await expect(page.getByRole('dialog', { name: 'Image viewer', exact: true })).toHaveCount(1);
    // Click selection still works immediately after a completed drag; hover has no magnification.
    const next = dock.locator('[data-dock-index="104"] button');
    const boxBeforeHover = await next.boundingBox();
    await next.hover();
    expect((await next.boundingBox())!.width).toBeCloseTo(boxBeforeHover!.width, 1);
    await next.click();
    await expect(page).toHaveURL(`${origin.origin}/library/${items[104]!.id}`);
    await centered(1440);
    const carousel = page.getByRole('region', { name: 'Просмотр изображений — перетащите для выбора' });
    const moving = page.locator('.image-viewer-content');
    const position = () => dock.locator('.image-viewer-dock-track').evaluate((track) => -new DOMMatrix(getComputedStyle(track).transform).m41 / 96);
    const assertDepth = async (index: number, viewportWidth: number) => {
      const placement = await carousel.locator('[data-carousel-index]').evaluateAll((elements) => elements.map((el) => ({
        index: Number((el as HTMLElement).dataset.carouselIndex),
        scale: new DOMMatrix(getComputedStyle(el).transform).m11,
        x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height,
      })));
      const center = placement.find((p) => p.index === index)!;
      const near = placement.find((p) => p.index === index - 1)!;
      const far = placement.find((p) => p.index === index - 2)!;
      expect(center.scale).toBeCloseTo(1);
      expect(near.height).toBeLessThan(center.height);
      expect(far.height).toBeLessThan(near.height);
      expect(near.x + near.width).toBeGreaterThan(0);
      expect(Math.abs(center.x + center.width / 2 - viewportWidth / 2)).toBeLessThan(1.5);
    };
    await assertDepth(104, 1440);
    // A brief pause before letting go must not erase a thumbnail fling. Assert
    // substantial coasting, not just the next-card snap masquerading as inertia.
    await page.mouse.move(720, 126); await page.mouse.down();
    await page.mouse.move(600, 126, { steps: 5 });
    const thumbnailRelease = await position();
    await page.waitForTimeout(120); await page.mouse.up();
    await expect.poll(position, { timeout: 2000 }).toBeGreaterThan(thumbnailRelease + 0.75);
    await expect(moving).not.toHaveClass(/image-viewer-content-moving/);
    await dock.locator('[data-dock-index="104"] button').click();
    await expect(page).toHaveURL(`${origin.origin}/library/${items[104]!.id}`); await centered(1440);
    // Even a one-pixel movement is a drag. Holding removes momentum, but the
    // fractional resting position must survive release and stay off-center.
    for (const surface of [carousel, dock]) {
      for (const distance of [1, 23, -19]) {
        const card = await surface.locator('[aria-current="true"]').boundingBox();
        const x = card!.x + card!.width / 2; const y = card!.y + card!.height / 2;
        const before = await position();
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x - distance, y, { steps: distance === 1 ? 1 : 6 });
        await expect(surface).toHaveAttribute('data-dragging', 'true');
        const held = await position();
        expect(Math.sign(held - before)).toBe(Math.sign(distance));
        await page.waitForTimeout(350); await page.mouse.up();
        await expect(moving).not.toHaveClass(/image-viewer-content-moving/);
        await expect.poll(position).toBeCloseTo(held, 4);
        await page.waitForTimeout(120);
        expect(await position()).toBeCloseTo(held, 4);
      }
      const card = (await surface.locator('[aria-current="true"]').boundingBox())!;
      const x = card.x + card.width / 2; const y = card.y + card.height / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x - 1, y);
      const tinyRelease = await position();
      await page.mouse.up();
      await expect.poll(position).toBeGreaterThan(tinyRelease + 0.00001);
      await expect(moving).not.toHaveClass(/image-viewer-content-moving/);
    }
    // Clicking the nearest thumbnail centers it even when its selected ID has
    // not changed. Clicking a large neighbour is no longer a snap command.
    const freePosition = await position();
    expect(Math.abs(freePosition - Math.round(freePosition))).toBeGreaterThan(0.001);
    await carousel.locator('[data-carousel-index="105"]').click();
    expect(await position()).toBeCloseTo(freePosition, 4);
    await dock.locator('[data-dock-index="104"] button').click(); await centered(1440);
    // Non-adjacent thumbnail selection must visibly animate BOTH surfaces, not
    // just settle at the correct destination after an instantaneous jump.
    const samples = page.evaluate(() => new Promise<{ position: number; targetX: number }[]>((resolve) => {
      const values: { position: number; targetX: number }[] = [];
      const start = performance.now();
      const read = () => {
        const track = document.querySelector('.image-viewer-dock-track')!;
        const card = document.querySelector('[data-carousel-index="108"]')?.getBoundingClientRect();
        values.push({ position: -new DOMMatrix(getComputedStyle(track).transform).m41 / 96,
          targetX: card ? card.x + card.width / 2 : -1 });
        if (performance.now() - start < 450) requestAnimationFrame(read); else resolve(values);
      };
      requestAnimationFrame(read);
    }));
    await dock.locator('[data-dock-index="108"] button').click();
    const frames = await samples;
    expect(frames.some((sample) => sample.position > 104.1 && sample.position < 107.5)).toBe(true);
    const intermediate = frames.filter((sample) => sample.position > 104.1 && sample.position < 107.9);
    expect(intermediate.length).toBeGreaterThan(2);
    expect(intermediate[0]!.targetX).toBeGreaterThan(intermediate.at(-1)!.targetX + 10);
    await expect(page).toHaveURL(`${origin.origin}/library/${items[108]!.id}`); await centered(1440);
    await assertDepth(108, 1440);
    await dock.locator('[data-dock-index="104"] button').click();
    await expect(page).toHaveURL(`${origin.origin}/library/${items[104]!.id}`); await centered(1440);
    const leftNeighbor = page.locator('[data-carousel-index="103"]');
    const rightNeighbor = page.locator('[data-carousel-index="105"]');
    expect((await leftNeighbor.boundingBox())!.x).toBeLessThan(720);
    expect((await rightNeighbor.boundingBox())!.x).toBeLessThan(1440);
    expect(await rightNeighbor.locator('.image-viewer-carousel-dim').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeCloseTo(0.38);
    expect(await page.locator('[data-carousel-index="104"] .image-viewer-carousel-dim').evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(0);
    expect(await page.locator('.image-viewer-nav-next').evaluate((el) => getComputedStyle(el).borderWidth)).toBe('0px');
    const originalsBeforeCoast = originals;
    await page.mouse.move(720, 450); await page.mouse.down();
    await page.mouse.move(360, 450, { steps: 5 });
    const releasedAt = await position();
    await page.mouse.up();
    await expect(moving).toHaveClass(/image-viewer-content-moving/);
    await expect.poll(position).toBeGreaterThan(releasedAt + 0.04);
    expect(originals).toBe(originalsBeforeCoast);
    // A press brakes the SAME motion, rather than selecting the card under the pointer.
    await page.mouse.down();
    const pressedAt = await position();
    await page.waitForTimeout(70);
    expect(await position()).toBeGreaterThan(pressedAt);
    await page.mouse.up();
    await expect(moving).not.toHaveClass(/image-viewer-content-moving/);
    const restingPosition = await position();
    const settledIndex = Math.round(restingPosition);
    await page.waitForTimeout(150);
    expect(await position()).toBeCloseTo(restingPosition, 4);
    expect(settledIndex).toBeGreaterThan(104);
    await expect(page).toHaveURL(`${origin.origin}/library/${items[settledIndex]!.id}`);
    await expect(page.locator('.image-viewer-media')).toHaveJSProperty('src', new URL(items[settledIndex]!.contentUrl, origin).href);
    expect(await carousel.locator('[data-carousel-index]').count()).toBeLessThanOrEqual(9);
    await page.screenshot({ path: testInfo.outputPath('library-carousel-desktop.png') });
    // Restore a known selection for cancellation and boundary assertions.
    await dock.locator('[data-dock-index="104"] button').click();
    await expect(page).toHaveURL(`${origin.origin}/library/${items[104]!.id}`); await centered(1440);
    // Thumbnail click during inertia retargets both tracks (main-area press
    // remains a brake). Hold the tap while its tile is still moving underneath.
    await page.mouse.move(720, 126); await page.mouse.down();
    await page.mouse.move(600, 126, { steps: 5 }); await page.mouse.up();
    await expect(moving).toHaveClass(/image-viewer-content-moving/);
    const destination = await dock.locator('[data-dock-index="108"] button').boundingBox();
    await page.mouse.move(destination!.x + destination!.width / 2, 126);
    await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
    await expect(page).toHaveURL(`${origin.origin}/library/${items[108]!.id}`); await centered(1440);
    await dock.locator('[data-dock-index="104"] button').click();
    await expect(page).toHaveURL(`${origin.origin}/library/${items[104]!.id}`); await centered(1440);
    // Cancelling a live gesture does not close the viewer or change its selected image.
    await page.mouse.move(720, 126); await page.mouse.down();
    await page.mouse.move(528, 126, { steps: 12 });
    await page.keyboard.press('Escape'); await page.mouse.up();
    await centered(1440);
    await expect(page).toHaveURL(`${origin.origin}/library/${items[104]!.id}`);
    await dock.focus(); await page.keyboard.press('Home');
    await expect(page).toHaveURL(`${origin.origin}/library/${items[0]!.id}`); await centered(1440);
    await page.keyboard.press('End');
    await expect(page).toHaveURL(`${origin.origin}/library/${items[199]!.id}`); await centered(1440);
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(`${origin.origin}/library/${items[198]!.id}`); await centered(1440);
    // Resize keeps the same header/strip geometry, including portrait originals.
    await page.setViewportSize({ width: 375, height: 812 });
    await centered(375);
    await assertDepth(198, 375);
    expect(await dock.boundingBox()).toMatchObject({ x: 0, y: 76, width: 375, height: 104 });
    expect(await dock.locator('img').count()).toBeLessThanOrEqual(12);
    const toolbar = page.getByRole('group', { name: 'Действия с изображением' });
    for (const button of await toolbar.getByRole('button').all()) {
      await expect.poll(async () => {
        const box = await button.boundingBox();
        return Boolean(box && box.x >= 0 && box.x + box.width <= 375 && box.y + box.height <= 812);
      }).toBe(true);
    }
    const badgeBox = await page.locator('.image-viewer-version-badge').boundingBox();
    expect(badgeBox!.y + badgeBox!.height).toBeLessThanOrEqual((await toolbar.boundingBox())!.y);
    await page.screenshot({ path: testInfo.outputPath('library-dock-mobile.png') });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 185, y: 126 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 281, y: 126 }] });
    await page.waitForTimeout(350);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page).toHaveURL(`${origin.origin}/library/${items[197]!.id}`); await centered(375);
    for (const fraction of [0.01, 0.06]) {
      const card = await carousel.locator('[aria-current="true"]').boundingBox();
      const x = card!.x + card!.width / 2; const y = card!.y + card!.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - card!.width * fraction!, y }] });
      await expect(carousel).toHaveAttribute('data-dragging', 'true');
      const held = await position();
      await page.waitForTimeout(350);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(moving).not.toHaveClass(/image-viewer-content-moving/);
      await expect.poll(position).toBeCloseTo(held, 4);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dock.focus(); await page.keyboard.press('Home'); await centered(375);
    // Horizontal wheel selects once after scrolling stops.
    await dock.hover(); await page.mouse.wheel(96 * 2.25, 0);
    await expect(page).toHaveURL(`${origin.origin}/library/${items[2]!.id}`);
    await expect(moving).not.toHaveClass(/image-viewer-content-moving/);
    await expect.poll(position).toBeCloseTo(2.25, 4);
    // Escape returns to the previous fractional resting position, not its ID.
    await page.mouse.move(185, 126); await page.mouse.down();
    await page.mouse.move(135, 126, { steps: 5 });
    await page.keyboard.press('Escape'); await page.mouse.up();
    await expect.poll(position).toBeCloseTo(2.25, 4);
    expect(paidRequests).toBe(0);
  } finally {
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});
