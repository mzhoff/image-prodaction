import { expect, test } from '@playwright/test';

test.use({
  locale: 'ru-RU',
  screenshot: 'off',
  trace: 'off',
  video: 'off',
  viewport: { width: 1127, height: 1269 },
});

test('login theme control is segmented, keyboard accessible, and persistent', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.context().clearCookies();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login?next=%2F', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.cookie.includes('production_locale=ru'))).toBe(true);

  const themeControl = page.getByRole('group', { name: 'Тема оформления' });
  const lightButton = themeControl.getByRole('button', { name: 'Светлая' });
  const darkButton = themeControl.getByRole('button', { name: 'Тёмная' });
  await expect(themeControl.getByRole('button')).toHaveCount(2);
  await expect(themeControl.getByRole('switch')).toHaveCount(0);
  await expect(lightButton).toHaveAttribute('aria-pressed', 'true');
  await expect(darkButton).toHaveAttribute('aria-pressed', 'false');

  await darkButton.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-pui-preference', 'dark');
  await expect(darkButton).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pui-theme'))).toBe('dark');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Тёмная' })).toHaveAttribute('aria-pressed', 'true');

  const secondPage = await page.context().newPage();
  await secondPage.goto('/login?next=%2F', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => secondPage.evaluate(() => document.cookie.includes('production_locale=ru'))).toBe(true);
  await expect(secondPage.getByRole('button', { name: 'Тёмная' })).toHaveAttribute('aria-pressed', 'true');
  await secondPage.getByRole('button', { name: 'Светлая' }).click();
  await expect(secondPage.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Светлая' })).toHaveAttribute('aria-pressed', 'true');
  await secondPage.close();

  const box = await themeControl.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeLessThanOrEqual(42);
  expect(1127 - box!.x - box!.width).toBeLessThanOrEqual(42);
  await page.screenshot({ path: 'test-results/theme-language-controls.png' });
  expect(pageErrors).toEqual([]);
});

test('language selector follows browser locale, lists roadmap languages, and persists choice', async ({ browser, baseURL }) => {
  const russianContext = await browser.newContext({ baseURL, locale: 'ru-RU', viewport: { width: 1127, height: 1269 } });
  const russianPage = await russianContext.newPage();
  await russianPage.goto('/login?next=%2F', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => russianPage.evaluate(() => document.cookie.includes('production_locale=ru'))).toBe(true);
  await expect(russianPage.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(russianPage.getByRole('region', { name: 'Войти в Reverie', exact: true })).toBeVisible();

  const selector = russianPage.getByRole('combobox', { name: 'Язык приложения' });
  await expect(selector).toContainText('🇷🇺');
  await expect(selector).toContainText('RU');
  await selector.click();
  await expect(russianPage.getByRole('option')).toHaveCount(5);
  await expect(russianPage.getByRole('option', { name: /Русский/ })).toBeEnabled();
  await expect(russianPage.getByRole('option', { name: /English/ })).toBeEnabled();
  await expect(russianPage.getByRole('option', { name: /中文/ })).toBeDisabled();
  await expect(russianPage.getByRole('option', { name: /Deutsch/ })).toBeDisabled();
  await expect(russianPage.getByRole('option', { name: /Español/ })).toBeDisabled();
  await expect(russianPage.getByRole('option', { name: /中文/ })).toHaveAttribute('data-disabled', '');
  await expect(russianPage.getByRole('option', { name: /Deutsch/ })).toHaveAttribute('data-disabled', '');
  await expect(russianPage.getByRole('option', { name: /Español/ })).toHaveAttribute('data-disabled', '');
  await expect(russianPage.getByRole('option', { name: /中文/ })).toContainText('Скоро');
  await russianPage.screenshot({ path: 'test-results/language-selector-options.png' });

  await russianPage.getByRole('option', { name: /English/ }).click();
  await expect(russianPage.locator('html')).toHaveAttribute('lang', 'en');
  await expect(russianPage.getByRole('region', { name: 'Sign in to Reverie', exact: true })).toBeVisible();
  await expect.poll(() => russianPage.evaluate(() => localStorage.getItem('production:interface-locale:v1:guest'))).toBe('en');
  await russianPage.reload({ waitUntil: 'domcontentloaded' });
  await expect(russianPage.getByRole('combobox', { name: 'Application language' })).toContainText('🇬🇧');
  await expect(russianPage.getByRole('combobox', { name: 'Application language' })).toContainText('EN');
  await russianPage.screenshot({ path: 'test-results/language-selector-en.png' });
  await russianContext.close();

  const germanContext = await browser.newContext({ baseURL, locale: 'de-DE', viewport: { width: 1127, height: 1269 } });
  const germanPage = await germanContext.newPage();
  await germanPage.goto('/login?next=%2F', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => germanPage.evaluate(() => document.cookie.includes('production_locale=en'))).toBe(true);
  await expect(germanPage.locator('html')).toHaveAttribute('lang', 'en');
  await expect(germanPage.getByRole('region', { name: 'Sign in to Reverie', exact: true })).toBeVisible();
  await expect(germanPage.getByRole('combobox', { name: 'Application language' })).toContainText('🇬🇧');
  await germanContext.close();
});
