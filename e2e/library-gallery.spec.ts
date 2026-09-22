import { gotoQaSection } from './release-user-fixture';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createAudioQaOwner } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 1440, height: 1000 } });

test('Library visual gallery: proportions, minute groups, metadata, filters and viewer return', async ({ page, context, baseURL }, testInfo) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local-only QA');
  const owner = await createAudioQaOwner(origin.origin, 'library-gallery');
  await context.addCookies(owner.http.browserSessionCookies());
  const dimensions = [[1600, 900], [900, 1400], [1200, 1200], [1800, 1000]];
  const colors = ['#8c8fa8', '#9cbdad', '#d2b8a0', '#c0b2d4'];
  const pictures = await Promise.all(dimensions.map(([width, height], i) => sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${colors[i]}"/><stop offset="1" stop-color="#f6eee6"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width! * .65}" cy="${height! * .38}" r="${Math.min(width!, height!) * .2}" fill="#ffffff70"/><path d="M0 ${height} L${width! * .3} ${height! * .5} L${width! * .6} ${height! * .8} L${width} ${height! * .3} V${height}Z" fill="${colors[i]}"/></svg>`,
  )).resize({ width: 480 }).png().toBuffer()));
  const items = Array.from({ length: 24 }, (_, i) => {
    const id = `019a3456-0000-7000-8000-${String(i).padStart(12, '0')}`;
    return { id, workspaceId: owner.workspaceId, document: { id: 'project-qa', name: 'Тестовый проект', status: 'active' },
      originalName: `generated-technical-${i}.png`, contentType: 'image/png', mediaKind: 'image', origin: i % 2 ? 'uploaded' : 'generated',
      provider: null, modelId: 'qa-vision', operation: 'generation', width: dimensions[i % 4]![0], height: dimensions[i % 4]![1],
      byteSize: i === 23 ? null : 3_145_728,
      createdAt: new Date(Date.UTC(2026, 8, 8, 10, 30 - Math.floor(i / 4), 50 - i % 4)).toISOString(),
      contentUrl: `/api/assets/${id}/content`, thumbnailUrl: `/api/assets/${id}/content?variant=thumbnail` };
  });
  let originals = 0; let lists = 0; let paid = 0;
  await page.route('**/api/ai/**', (route) => { if (route.request().method() === 'GET') return route.continue(); paid++; return route.abort(); });
  await page.route('**/api/assets?*', (route) => {
    lists++;
    const params = new URL(route.request().url()).searchParams;
    let filtered = items.filter((item) => (!params.get('origin') || params.get('origin') === item.origin)
      && (!params.get('modelId') || params.get('modelId') === item.modelId)
      && (!params.get('documentId') || params.get('documentId') === item.document.id)
      && (!params.get('mediaKind') || params.get('mediaKind') === item.mediaKind)
      && (!params.get('search') || item.originalName.includes(params.get('search')!)));
    const nextCursor = !params.has('cursor') && filtered.length > 18 ? 'next-page' : null;
    filtered = params.has('cursor') ? filtered.slice(18) : filtered.slice(0, 18);
    return route.fulfill({ json: { items: filtered, nextCursor, facets: {
      origins: [{ value: 'generated', count: 12 }, { value: 'uploaded', count: 12 }],
      models: [{ modelId: 'qa-vision', provider: null, count: 24 }],
      documents: [{ id: 'project-qa', name: 'Тестовый проект', status: 'active', count: 24 }],
      mediaKinds: [{ value: 'image', count: 24 }],
    } } });
  });
  await page.route('**/api/assets/*/content*', (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has('variant')) originals++;
    const index = Number(url.pathname.split('/')[3]!.slice(-12));
    return route.fulfill({ contentType: 'image/png', body: pictures[index % 4] });
  });
  const gallery = page.locator('.library-gallery');
  const card = page.locator('.library-card').first();
  const geometry = async () => {
    // The responsive sidebar animates its width. Wait for the rows' observer
    // to catch up, then read the container and all cards in the SAME frame.
    await expect.poll(() => gallery.evaluate((element) => {
      const area = element.getBoundingClientRect();
      return [...element.querySelectorAll('.library-card')].every((card) => card.getBoundingClientRect().right <= area.right + 1);
    })).toBe(true);
    const { boxes, area } = await gallery.evaluate((element) => ({ area: element.getBoundingClientRect().toJSON(),
      boxes: [...element.querySelectorAll<HTMLElement>('.library-card')].map((card) => {
        const box = card.getBoundingClientRect();
        return { id: card.dataset.assetId, x: box.x, width: box.width, height: box.height };
      }),
    }));
    for (const box of boxes) {
      const item = items.find((item) => item.id === box.id)!;
      expect(box.width / box.height).toBeCloseTo(item.width! / item.height!, 2);
      expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width + 1);
    }
  };
  try {
    await gotoQaSection(page, '/library');
    await expect(page.locator('.library-card')).toHaveCount(18);
    await expect(page.getByRole('button', { name: 'Галерея', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await geometry();
    await expect(page.locator('.library-origin-badge, .library-card-body, .library-card-meta')).toHaveCount(0);
    await expect(card.locator('.library-card-details')).toHaveCSS('opacity', '0');
    await card.hover();
    await expect(card.locator('.library-card-details')).toHaveCSS('opacity', '1');
    await expect(card.locator('.library-card-details')).toContainText('1600 × 900 · 3 МБ');
    await expect(card).not.toContainText('generated-technical');
    expect(originals).toBe(0);
    await page.mouse.move(10, 10);
    await card.locator('a').focus();
    await expect(card.locator('.library-card-details')).toHaveCSS('opacity', '1');
    await page.getByRole('heading', { name: 'Library', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('library-gallery-desktop.png') });
    const beforeMode = lists;
    await page.getByRole('button', { name: 'По датам', exact: true }).click();
    await expect(page.getByRole('button', { name: 'По датам', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/view=dates/);
    await expect(page.locator('.pui-media-date-heading')).toHaveCount(5);
    expect(lists).toBe(beforeMode);
    await page.getByRole('button', { name: 'Показать ещё' }).click();
    await expect(page.locator('.library-card')).toHaveCount(24);
    await expect(page.locator('.pui-media-date-heading')).toHaveCount(6);
    await expect(page.locator('.pui-media-gallery-group').nth(4).locator('.library-card')).toHaveCount(4);
    await page.locator('.library-section .production-section-body').evaluate((element) => { element.scrollTop = 0; });
    await geometry();
    await page.screenshot({ path: testInfo.outputPath('library-gallery-dates.png') });

    await card.locator('a').click();
    await expect(page.getByRole('dialog', { name: 'Image viewer', exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${items[0]!.id}\\?view=dates`));
    await page.getByRole('button', { name: 'Next generated image' }).click();
    await expect(page).toHaveURL(new RegExp(`${items[1]!.id}\\?view=dates`));
    await page.getByRole('button', { name: 'Close image viewer', exact: true }).last().click();
    await expect(page.getByRole('button', { name: 'По датам', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(`${origin.origin}/library?view=dates`);
    await page.reload();
    await expect(page.getByRole('button', { name: 'По датам', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
    for (const [label, option, parameter] of [['Источник', 'Сгенерированные', 'origin=generated'], ['Тип медиа', 'Изображения', 'mediaKind=image'], ['Модель', 'qa-vision', 'modelId=qa-vision'], ['Канвас', 'Тестовый проект', 'documentId=project-qa']]) {
      await page.getByRole('combobox', { name: label, exact: true }).click();
      await page.getByRole('option', { name: new RegExp(option!) }).click();
      await expect(page).toHaveURL(new RegExp(parameter));
      await expect(page.getByRole('button', { name: 'По датам', exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(page.locator('.library-card')).toHaveCount(12);
    await page.getByRole('button', { name: 'Поиск по библиотеке', exact: true }).click();
    const search = page.getByRole('dialog', { name: 'Поиск в Workspace' });
    await search.getByRole('searchbox', { name: 'Найти файлы в Workspace' }).fill('not-found');
    await search.getByRole('button', { name: 'Фильтры · 4', exact: true }).click();
    await search.getByRole('button', { name: 'Показать в библиотеке', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Материалы не найдены' })).toBeVisible();
    await page.getByRole('button', { name: 'Сбросить фильтры' }).first().click();
    await expect(page.locator('.library-card')).toHaveCount(18);
    await expect(page).toHaveURL(`${origin.origin}/library?view=dates`);
    await page.getByRole('button', { name: 'Галерея', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Галерея', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await card.click({ button: 'right' });
    await expect(page.locator('.context-menu').getByRole('button', { name: 'Скопировать ссылку' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 375, height: 812 });
    // Nested sections stay reachable in the expanded sidebar on narrow screens.
    await page.getByRole('button', { name: 'Свернуть меню', exact: true }).click();
    // The shell has a width transition; inspect the completed narrow layout.
    await expect(page.locator('.workspace-sidebar')).toHaveCSS('width', '57px');
    await expect.poll(() => gallery.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await geometry();
    await expect.poll(() => page.locator('.library-section .production-section-body').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('library-gallery-mobile.png') });
    expect(paid).toBe(0);
  } finally { await owner.http.request('/api/auth/sign-out', { json: {} }); }
});
