import { expect, test } from '@playwright/test';
import { AudioQaHttp, createAudioQaOwner } from './audio-runtime-fixtures';
import { emptyUsage, usagePeriod } from '../src/modules/usage/core/usage-dashboard';
import { usageComparisonWindow, usagePresetPeriod } from '../src/modules/usage/core/usage-periods';
import { buildUsageChart } from '../src/modules/usage/core/usage-chart';
import type { UsageDashboardRow } from '../src/modules/usage/contracts/usage-dashboard';

test.use({ trace: 'off', video: 'off' });
test.describe('Workspace Usage', () => {
  test.skip(process.env.USAGE_UI_E2E !== '1', 'Explicit local-only Usage QA opt-in.');

  test('real API authorization; synthetic UI filters, chart, responsive themes and stale Workspace response', async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(150_000);
    const origin = baseURL!;
    expect(['localhost', '127.0.0.1']).toContain(new URL(origin).hostname);
    const own = await createAudioQaOwner(origin, 'Usage A');
    const other = await createAudioQaOwner(origin, 'Usage B');
    const path = `/api/workspaces/${own.workspaceId}/usage`;
    const ownResponse = await own.http.request(path);
    expect(ownResponse.status).toBe(200);
    expect(ownResponse.headers.get('cache-control')).toBe('private, no-store');
    const initial = await ownResponse.json();
    expect(initial.workspaceId).toBe(own.workspaceId);
    expect(initial.rows).toEqual([]);
    expect(initial.comparison.rows).toEqual([]);
    expect((await other.http.request(path)).status).toBe(403);
    expect((await own.http.request(`/api/workspaces/${other.workspaceId}/usage`)).status).toBe(403);
    expect((await new AudioQaHttp(origin).request(path)).status).toBe(401);
    expect((await own.http.request(`${path}?from=2026-02-30&to=2026-03-01`)).status).toBe(400);
    expect((await own.http.request(`${path}?timezone=Invalid`)).status).toBe(400);
    await context.addCookies(own.http.browserSessionCookies());
    await page.goto('/usage');
    await expect(page.getByRole('heading', { name: 'Usage', exact: true })).toBeVisible();
    await expect(page.getByText('За выбранный период и с этими фильтрами данных нет.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Usage', exact: true })).toHaveAttribute('aria-current', 'page');

    // UI-only fixtures: they are not written to the database or used as financial evidence.
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: { workspaces: [
      { id: own.workspaceId, name: 'Usage QA · Studio A' }, { id: other.workspaceId, name: 'Usage QA · Studio B' },
    ] } }));
    await page.route('**/api/workspaces/*/folders', (route) => route.fulfill({ json: { folders: [] } }));
    let delayA = false;
    let releaseA: (() => void) | undefined;
    let delayedStarted: (() => void) | undefined;
    await page.route('**/api/workspaces/*/usage?*', async (route) => {
      const url = new URL(route.request().url());
      const workspaceId = url.pathname.split('/')[3]!;
      const period = usagePeriod(url.searchParams.get('from'), url.searchParams.get('to'), url.searchParams.get('timezone')!);
      const rows: UsageDashboardRow[] = workspaceId === own.workspaceId ? [
        { ...emptyUsage(), day: period.to, provider: 'openrouter', modelId: 'qa/image-model', category: 'image', requests: 6, succeeded: 5, failed: 1, images: 5, inputTokens: '1000', outputTokens: '200', totalTokens: '1200', costUsd: '1.50000000' },
        { ...emptyUsage(), day: period.to, provider: 'openrouter', modelId: 'qa/text-model', category: 'text', requests: 4, succeeded: 4, texts: 4, inputTokens: '2000', outputTokens: '500', totalTokens: '2500', costUsd: '0.25000000' },
        { ...emptyUsage(), day: period.from, provider: 'openrouter', modelId: 'qa/voice-model', category: 'audio', requests: 2, succeeded: 2, audio: 2, inputTokens: '100', outputTokens: '200', totalTokens: '300', costUsd: '0.25000000' },
        { ...emptyUsage(), day: period.to, provider: 'openrouter', modelId: 'qa/video-model', category: 'video', requests: 3, succeeded: 2, unconfirmed: 1, video: 2, unknownCostRequests: 1, unknownTokenRequests: 3, costUsd: '3.00000000' },
        { ...emptyUsage(), day: period.to, provider: 'openrouter', modelId: 'qa/chat-model', category: 'assistant', requests: 5, succeeded: 5, inputTokens: '900', outputTokens: '100', totalTokens: '1000', costUsd: '0.10000000' },
      ] : [];
      if (delayA && workspaceId === own.workspaceId) {
        await new Promise<void>((resolve) => { releaseA = resolve; delayedStarted?.(); });
      }
      const comparison = usageComparisonWindow(period);
      const previousRows = rows.map((r) => ({ ...r, day: comparison.period.to, requests: 2, succeeded: 2, failed: 0, images: r.images ? 2 : 0, texts: r.texts ? 2 : 0, audio: r.audio ? 1 : 0, video: r.video ? 1 : 0,
        costUsd: r.modelId === 'qa/text-model' ? '0.12500000' : r.costUsd }));
      await route.fulfill({ json: { workspaceId, period, generatedAt: new Date().toISOString(), rows, comparison: { ...comparison, rows: previousRows } } }).catch(() => { /* Aborted old Workspace request. */ });
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.reload();
    const stats = page.getByRole('region', { name: 'Общая статистика' });
    await expect(stats).toContainText('20');
    await expect(stats).toContainText('≥ $5.10');
    await expect(page.locator('.usage-results')).toContainText('Видео');
    await expect(page.getByRole('button', { name: 'Месяц', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.usage-metric').filter({ hasText: 'Физические вызовы' }).locator('.usage-delta')).toHaveText('↑ +100%');
    await expect(page.locator('.usage-metric').filter({ hasText: 'Без стоимости' }).locator('.usage-delta')).toHaveText('Нет сравнения');
    await expect(page.locator('.usage-line')).toHaveCount(5);
    await page.locator('.usage-legend input').first().uncheck();
    await expect(page.locator('.usage-line')).toHaveCount(4);
    await expect(stats).toContainText('≥ $5.10');
    await page.locator('.usage-legend input').first().check();
    await page.screenshot({ path: testInfo.outputPath('usage-line.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Столбчатый график', exact: true }).click();
    await expect(page.locator('.usage-bar').first()).toBeVisible();
    const maxHeight = await page.locator('.usage-bar').evaluateAll((bars) => Math.max(...bars.map((bar) => bar.getBoundingClientRect().height)));
    expect(maxHeight).toBeGreaterThan(50);
    await page.screenshot({ path: testInfo.outputPath('usage-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('heading', { name: 'По типам операций', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('usage-models.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Тип операции', exact: true }).click();
    await page.getByRole('option', { name: 'Видео', exact: true }).click();
    await expect(stats).toContainText('≥ $3.00');
    await expect(page.locator('.usage-metric').filter({ hasText: 'Физические вызовы' })).toContainText('3');
    await page.getByRole('button', { name: 'Тип операции', exact: true }).click();
    await page.getByRole('option', { name: 'Все типы', exact: true }).click();
    await page.getByRole('button', { name: 'Модель', exact: true }).click();
    await page.getByRole('option', { name: 'qa/text-model', exact: true }).click();
    await expect(stats).toContainText('$0.25');
    await expect(page.locator('.usage-metric').filter({ hasText: 'Подтверждённая стоимость' }).locator('.usage-delta')).toHaveText('↑ +100%');
    await page.getByRole('button', { name: 'Модель', exact: true }).click();
    await page.getByRole('option', { name: 'Все модели', exact: true }).click();
    await page.getByRole('button', { name: 'Квартал', exact: true }).click();
    await expect(page.locator('.usage-point-target')).toHaveCount(Math.round((Date.parse(usagePresetPeriod('quarter').end) - Date.parse(usagePresetPeriod('quarter').start)) / 86_400_000));
    await page.getByRole('combobox', { name: 'Детализация графика' }).selectOption('month');
    await expect(page.locator('.usage-point-target')).toHaveCount(buildUsageChart([], usagePresetPeriod('quarter'), 'month').points.length);
    await expect(page.getByRole('button', { name: 'Столбчатый график', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Свой период', exact: true }).click();
    await page.getByLabel('Начало периода', { exact: true }).fill('2026-09-10');
    await page.getByLabel('Конец периода', { exact: true }).fill('2026-09-01');
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Выбор диапазона дат' }).getByRole('alert')).toBeVisible();
    await page.getByLabel('Начало периода', { exact: true }).fill('2026-08-01');
    await page.screenshot({ path: testInfo.outputPath('usage-date-picker.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Выбор диапазона дат' })).not.toBeVisible();
    await expect(page.locator('.usage-point-target')).toHaveCount(2);
    await expect(page.locator('.usage-presets [aria-pressed=true]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
    await expect(page.locator('.usage-point-target')).toHaveCount(1);
    await expect(page.locator('.usage-freshness')).toContainText('оба периода до одинакового времени');
    await page.getByRole('button', { name: 'Вчера', exact: true }).click();
    await expect(page.locator('.usage-freshness')).not.toContainText('оба периода до одинакового времени');
    await page.getByRole('combobox', { name: 'Часовой пояс', exact: true }).selectOption('UTC');
    await expect(page.locator('.usage-freshness')).toContainText('UTC');
    await page.getByRole('combobox', { name: 'Детализация графика' }).selectOption('day');
    await page.getByRole('button', { name: 'Неделя', exact: true }).click();
    await expect(page.locator('.usage-point-target')).toHaveCount(7);
    await page.getByRole('button', { name: 'Линейный график', exact: true }).click();
    await page.getByRole('button', { name: 'Запросы', exact: true }).click();
    await page.locator('.usage-point-target').first().focus();
    await expect(page.locator('.usage-chart-detail')).toContainText('2 запросов');
    await page.getByRole('combobox', { name: 'Тема оформления' }).click();
    await page.getByRole('option', { name: 'Тёмная', exact: true }).click();
    const darkSurface = await page.locator('.usage-card').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect(page.locator('.usage-filters .brand-select-trigger').first()).toHaveCSS('background-color', darkSurface);
    await page.screenshot({ path: testInfo.outputPath('usage-dark.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('combobox', { name: 'Тема оформления' }).click();
    await page.getByRole('option', { name: 'Светлая', exact: true }).click();
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await page.setViewportSize({ width: 600, height: 1000 });
    await expect(stats).toBeVisible();
    expect(await page.locator('.usage-page').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('usage-narrow.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.locator('.usage-page').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('usage-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('heading', { name: 'Динамика по моделям', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Линейный график', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('usage-mobile-chart.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Свой период', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Выбор диапазона дат' });
    await expect(picker).toBeVisible();
    const box = await picker.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(72); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath('usage-mobile-picker.png'), fullPage: true, animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(picker).not.toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    delayA = true;
    const started = new Promise<void>((resolve) => { delayedStarted = resolve; });
    await page.getByRole('button', { name: 'Обновить', exact: true }).click();
    await started;
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('option', { name: 'Usage QA · Studio B', exact: true }).click();
    await expect(page.locator('.usage-page')).not.toContainText('qa/image-model');
    await expect(page.getByText('За выбранный период и с этими фильтрами данных нет.')).toBeVisible();
    releaseA?.();
    await expect(stats).toContainText('$0.00');
    await expect(page.locator('.usage-page')).not.toContainText('qa/image-model');
  });
});
