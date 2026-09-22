import { expect, test } from './identity-entry-fixture';

test.use({ locale: 'ru-RU', viewport: { width: 2560, height: 1269 } });

test('login has a segmented theme control, a gray backdrop, and lightweight moving media slots', async ({ page }) => {
  await page.goto('/login?next=%2F', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Добро пожаловать' })).toBeVisible();
  const switcher = page.locator('.auth-theme-switch');
  await expect(switcher).toHaveCSS('border-top-width', '0px');
  await expect(switcher).toHaveCSS('box-shadow', 'none');
  await expect(switcher.getByRole('button')).toHaveCount(2);
  await expect(switcher.getByRole('button', { name: 'Светлая' })).toHaveAttribute('aria-pressed', 'true');
  const atmosphere = await page.locator('.auth-form-area').evaluate((element) => {
    const spot = getComputedStyle(element, '::before');
    return { background: getComputedStyle(element).backgroundImage, size: spot.width,
      blur: spot.filter, opacity: Number(spot.opacity), animation: spot.animationName };
  });
  expect(atmosphere.background).toContain('linear-gradient');
  expect(atmosphere.size).toBe('300px');
  expect(atmosphere.blur).toBe('blur(64px)');
  expect(atmosphere.opacity).toBeLessThan(.3);
  expect(atmosphere.animation).toBe('auth-aura-drift');
  const accent = page.locator('.auth-dream-accent');
  await expect(accent).toHaveText('Мечтайте.');
  expect(await accent.evaluate((element) => getComputedStyle(element).color)).not.toBe(await page.locator('.auth-promo h1').evaluate((element) => getComputedStyle(element).color));
  await expect(page.locator('.auth-promo h1 br')).toHaveCount(1);
  const cards = page.locator('.auth-promo-card');
  await expect(cards).toHaveCount(6);
  const before = await cards.first().evaluate((element) => getComputedStyle(element).transform);
  await expect.poll(() => cards.first().evaluate((element) => getComputedStyle(element).transform)).not.toBe(before);
  expect(await page.locator('.auth-promo-gallery').evaluate((element) => getComputedStyle(element).overflow)).toBe('hidden');
  await expect(page.locator('.auth-promo-gallery :is(img, video)')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/auth-entry-light.png' });
  await switcher.getByRole('button', { name: 'Тёмная' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(switcher.getByRole('button', { name: 'Тёмная' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/auth-entry-dark.png' });
});

test('terms screen has only relevant instructions and an inert interactive terms link', async ({ page }) => {
  await page.goto('/login?identity_error=terms_required&identity_method=telegram&next=%2F', { waitUntil: 'domcontentloaded' });
  const card = page.locator('.auth-card');
  await expect(card.getByText('Подтвердите условия, чтобы завершить регистрацию.')).toBeVisible();
  await expect(card.getByText(/Войдите, чтобы создавать/)).toHaveCount(0);
  await expect(page.getByText('Подтвердите вход в Telegram и вернитесь в эту вкладку.')).toHaveCount(0);
  const continueButton = card.getByRole('button', { name: 'Продолжить', exact: true });
  await expect(continueButton).toBeDisabled();
  const before = page.url();
  const termsLink = card.getByRole('button', { name: 'Условия использования продукта — ссылка скоро появится' });
  await termsLink.click();
  expect(page.url()).toBe(before);
  await expect(card.getByRole('checkbox')).not.toBeChecked();
  await termsLink.hover();
  await termsLink.focus();
  await expect(page.getByRole('tooltip')).toContainText('Ссылка на условия появится здесь позже');
  await page.screenshot({ path: 'test-results/auth-entry-terms.png' });
});

test('login respects reduced motion and fits a small screen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login?next=%2F', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Добро пожаловать' })).toBeVisible();
  await expect(page.locator('.auth-promo')).not.toBeVisible();
  expect(await page.locator('.auth-form-area').evaluate((element) => getComputedStyle(element, '::before').animationName)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/auth-entry-mobile.png' });
});
