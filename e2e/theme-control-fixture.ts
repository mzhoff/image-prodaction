import { expect, type Page } from '@playwright/test';

export async function selectTheme(page: Page, theme: 'light' | 'dark' | 'system') {
  const label = { light: 'Светлая', dark: 'Тёмная', system: 'Системная' }[theme];
  const control = page.getByRole('combobox', { name: 'Тема оформления' }).first();
  if (await control.isVisible()) {
    // Canvas and account settings retain the shared select; the workspace shell
    // exposes quick preferences only inside the account popup.
    await control.click();
    await page.getByRole('option', { name: label, exact: true }).click();
    await expect(control).toHaveText(label);
  } else {
    const account = await openAccountPreferences(page);
    const option = account.getByRole('group', { name: 'Оформление', exact: true })
      .getByRole('button', { name: theme === 'system' ? 'Авто' : label, exact: true });
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await account.getByRole('button', { name: 'Закрыть аккаунт', exact: true }).click();
    await expect(account).toHaveCount(0);
  }
  await expect(page.locator('html')).toHaveAttribute('data-pui-preference', theme);
}

export async function openAccountPreferences(page: Page) {
  const account = page.getByRole('dialog', { name: 'Ваш аккаунт', exact: true });
  if (!await account.isVisible()) await page.getByRole('button', { name: /^Аккаунт:/ }).click();
  await expect(account).toBeVisible();
  return account;
}
