import { expect, test, type Locator } from '@playwright/test';

async function getInputTextContrast(input: Locator) {
  return input.evaluate((element) => {
    const parseRgb = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!channels || channels.length !== 3) throw new Error(`Unexpected color: ${value}`);
      return channels;
    };
    const luminance = (channels: number[]) => {
      const linear = channels.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
    };
    const ratio = (foreground: string, background: string) => {
      const foregroundLuminance = luminance(parseRgb(foreground));
      const backgroundLuminance = luminance(parseRgb(background));
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    };
    const inputStyle = getComputedStyle(element);
    const placeholderStyle = getComputedStyle(element, '::placeholder');
    return {
      placeholder: ratio(placeholderStyle.color, inputStyle.backgroundColor),
      value: ratio(inputStyle.color, inputStyle.backgroundColor),
    };
  });
}

test.use({
  channel: 'chrome',
  trace: 'off',
  video: 'off',
  screenshot: 'off',
  viewport: { width: 1148, height: 1267 },
});

test('login theme switch and visual contract', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.clearCookies();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login?next=%2F');

  const themeSwitch = page.getByRole('switch', { name: 'Тёмная тема' });
  await expect(themeSwitch).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'Тема оформления' })).toHaveCount(0);
  await expect(themeSwitch).not.toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const switchBox = (await page.locator('.auth-theme-switch').boundingBox())!;
  expect(switchBox.y).toBeLessThanOrEqual(42);
  expect(1148 - switchBox.x - switchBox.width).toBeLessThanOrEqual(42);

  await themeSwitch.focus();
  await themeSwitch.press('Space');
  await expect(themeSwitch).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-pui-preference', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('pui-theme'))).toBe('dark');
  await page.reload();
  await expect(themeSwitch).toBeChecked();
  await expect(page.locator('.auth-submit .pui-button__icon')).toHaveCSS('color', 'rgb(255, 255, 255)');
  const darkPlaceholderContrast = await getInputTextContrast(page.locator('input[name="password"]'));
  expect(darkPlaceholderContrast.placeholder).toBeGreaterThanOrEqual(4.5);
  expect(darkPlaceholderContrast.placeholder).toBeLessThan(darkPlaceholderContrast.value);

  const otherTab = await context.newPage();
  await otherTab.goto('/login?next=%2F');
  const otherSwitch = otherTab.getByRole('switch', { name: 'Тёмная тема' });
  await expect(otherSwitch).toBeChecked();
  await otherSwitch.click();
  await expect(otherTab.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(themeSwitch).not.toBeChecked();
  await otherTab.close();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Мечтайте. Способ найдётся.');
  await expect(page.locator('.auth-promo-content > p')).toHaveText(
    'Профессиональные инструменты для креаторов — от первой идеи до готового визуала.',
  );
  await expect(page.getByText('Доступ в рабочее пространство')).toHaveCount(0);
  await expect(page.getByText('Операционный эффект')).toHaveCount(0);
  await expect(page.locator('.auth-bars, .auth-metric-card, .auth-note-card')).toHaveCount(0);

  const card = page.locator('.auth-entry-card');
  const heading = card.getByRole('heading', { level: 2 });
  const cardBox = (await card.boundingBox())!;
  const headingBox = (await heading.boundingBox())!;
  expect(Math.abs(headingBox.x - cardBox.x)).toBeLessThanOrEqual(2);
  await expect(card).toHaveCSS('padding-left', '0px');

  const submit = page.getByRole('button', { name: 'Войти' });
  await expect(submit).toHaveCSS('height', '44px');
  await expect(submit).toHaveCSS('border-radius', '16px');
  await expect(submit).toHaveCSS('font-size', '14px');
  const submitIcon = submit.locator('.pui-button__icon');
  await expect(submitIcon).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(submitIcon).toHaveCSS('width', '14px');
  await expect(submitIcon).toHaveCSS('height', '14px');

  await expect(page.getByRole('link', { name: 'Забыли пароль?' })).toHaveCSS('font-weight', '550');
  const password = page.locator('input[name="password"]');
  const lightPlaceholderContrast = await getInputTextContrast(password);
  expect(lightPlaceholderContrast.placeholder).toBeGreaterThanOrEqual(4.5);
  expect(lightPlaceholderContrast.placeholder).toBeLessThan(lightPlaceholderContrast.value);

  await page.screenshot({ path: info.outputPath('login-theme-and-layout.png'), fullPage: true });
  expect(errors).toEqual([]);
});
