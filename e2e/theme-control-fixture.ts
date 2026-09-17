import { expect, type Page } from '@playwright/test';

export async function selectTheme(page: Page, theme: 'light' | 'dark' | 'system') {
  const label = { light: 'Светлая', dark: 'Тёмная', system: 'Системная' }[theme];
  await page.getByRole('combobox', { name: 'Тема оформления' }).first().click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pui-preference', theme);
}
