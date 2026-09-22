import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { Pool } from 'pg';
import { expect, test } from '@playwright/test';

test.use({ locale: 'ru-RU', viewport: { width: 2560, height: 1269 } });

test('profile fields, persistence, completion navigation and the welcome-to-tour flow', async ({ page, baseURL }, testInfo) => {
  test.skip(process.env.RUN_ONBOARDING_POSTGRES !== '1', 'Requires the local synthetic-account fixture');
  test.setTimeout(180_000);
  const connectionString = process.env.DATABASE_URL!;
  expect(['localhost', '127.0.0.1']).toContain(new URL(connectionString).hostname);
  expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname);
  const pool = new Pool({ connectionString });
  const id = `onboarding-visual-${randomUUID()}`, password = randomUUID();
  try {
    await pool.query(`INSERT INTO "user" (id,name,email,email_verified,terms_accepted_at,terms_version)
      VALUES ($1,'Onboarding QA',$2,true,now(),'test')`, [id, `${id}@example.invalid`]);
    await pool.query(`INSERT INTO account (id,account_id,provider_id,user_id,password) VALUES ($1,$1,'credential',$1,$2)`, [id, await hashPassword(password)]);
    const signedIn = await page.request.post('/api/auth/sign-in/email', {
      headers: { Origin: baseURL! }, data: { email: `${id}@example.invalid`, password },
    });
    expect(signedIn.status()).toBe(200);
    await page.goto('/onboarding?next=%2F', { waitUntil: 'domcontentloaded' });
    const name = page.getByRole('textbox', { name: 'Как к вам обращаться?' });
    await expect(name).toHaveValue('Onboarding QA');
    await expect(page.getByText('Около 2–3 минут · ответы сохраняются')).toHaveCount(0);
    await expect(page.getByText('Сохранено', { exact: true })).toHaveCount(0);
    const logout = page.getByRole('button', { name: 'Выйти', exact: true });
    expect(await logout.boundingBox()).toMatchObject({ width: 38, height: 38 });
    expect(await page.locator('.welcome-segment').boundingBox()).toMatchObject({ height: 38 });
    await logout.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Выйти');
    const system = page.getByRole('button', { name: 'Системная', exact: true });
    const idle = await system.evaluate((element) => getComputedStyle(element).backgroundColor);
    await system.hover();
    await expect.poll(() => system.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(idle);
    await name.fill('');
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveCSS('border-top-color', 'rgb(185, 28, 28)');
    const error = page.locator('#welcome-error-name');
    await expect(error).toHaveCSS('color', 'rgb(185, 28, 28)');
    expect((await error.boundingBox())!.y - ((await name.boundingBox())!.y + (await name.boundingBox())!.height)).toBe(4);
    await page.screenshot({ path: testInfo.outputPath('onboarding-validation.png') });
    await name.fill('Проверка');
    await page.getByRole('button', { name: '25–34', exact: true }).click();
    await page.getByRole('button', { name: 'Дизайн', exact: true }).click();
    await expect(page.locator('.welcome-heading .welcome-complete')).toBeVisible();
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await page.getByRole('button', { name: 'Работаю в компании', exact: true }).click();
    await page.getByRole('button', { name: '2–3', exact: true }).click();
    await expect(page.getByText('Как называется ваша компания?')).toHaveCount(0);
    await page.getByRole('button', { name: 'Другая сфера', exact: true }).click();
    const industry = page.getByRole('textbox', { name: 'Ваша сфера' });
    await expect(industry).toBeVisible();
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await expect(industry).toHaveAttribute('aria-invalid', 'true');
    await industry.fill('Архитектура');
    const back = await page.getByRole('button', { name: 'Назад', exact: true }).boundingBox();
    const next = await page.getByRole('button', { name: 'Продолжить', exact: true }).boundingBox();
    expect(next!.x - (back!.x + back!.width)).toBe(8);
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await page.getByRole('navigation', { name: 'Шаги знакомства' }).getByRole('button', { name: /Как вы работаете/ }).click();
    await expect(industry).toHaveValue('Архитектура');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(industry).toHaveValue('Архитектура');
    await page.screenshot({ path: testInfo.outputPath('onboarding-industry.png') });
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await page.getByRole('button', { name: 'Учёба и эксперименты', exact: true }).click();
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await page.getByRole('button', { name: 'Изображения и фото', exact: true }).click();
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    const help = page.locator('.welcome-question-help');
    await help.hover();
    await expect(page.getByRole('tooltip')).toContainText('Агент может выполнить несколько шагов');
    await expect(page.locator('.welcome-fields > p')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('onboarding-agent-tooltip.png') });
    for (const label of ['Только начинаю', 'Пока не знаком', 'Пока не использую', 'Ещё не пробовал']) {
      await page.getByRole('button', { name: label, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Открыть пространство', exact: true }).click();
    const welcome = page.getByRole('dialog').filter({ hasText: 'Добро пожаловать в Production' });
    await expect(welcome).toBeVisible({ timeout: 30_000 });
    const image = welcome.getByRole('img');
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    const rect = (await welcome.boundingBox())!;
    expect(Math.abs(rect.x + rect.width / 2 - 1280)).toBeLessThan(2);
    await expect(welcome.getByRole('progressbar', { name: '1 / 6', exact: true })).toBeVisible();
    await expect(welcome.getByRole('button', { name: 'Назад', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('home-welcome.png') });
    await welcome.getByRole('button', { name: 'Далее', exact: true }).click();
    for (const [index, title] of ['Боковое меню', 'Меню экосистемы', 'Главные действия', 'AI-ассистент', 'Подсказки всегда рядом'].entries()) {
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(title, { exact: true })).toBeVisible();
      await expect(dialog.getByRole('progressbar', { name: `${index + 2} / 6`, exact: true })).toBeVisible();
      // The close icon remains accessible; targeted steps omit only the extra footer action.
      await expect(dialog.locator('.pui-onboarding-card__supplementary').getByRole('button', { name: 'Пропустить онбординг', exact: true })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: 'Назад', exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`home-guide-${index + 1}.png`) });
      if (index < 4) await dialog.getByRole('button', { name: 'Далее', exact: true }).click();
      else {
        await expect(dialog.getByText('Возвращайтесь, когда забыли', { exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
      }
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Как начать работу', exact: true }).click();
    await welcome.locator('.pui-onboarding-card__supplementary').getByRole('button', { name: 'Пропустить онбординг', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await pool.query('DELETE FROM workspace WHERE created_by_user_id=$1', [id]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
    await pool.end();
  }
});
