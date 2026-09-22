import { expect, type Page } from '@playwright/test';
import type { OnboardingChange, OnboardingState } from '../src/shared/onboarding/contract';
import { sectionGuideForRoute, type SectionGuideId } from '../src/features/section-onboarding/model/section-guide';

/** Synthetic answers shared by UI and API fixtures; never bypass the onboarding gate. */
export function completedQaOnboarding(state: OnboardingState): OnboardingChange {
  return {
    revision: state.revision, step: 'experience', locale: 'ru', theme: 'light', complete: true,
    answers: {
      name: state.answers.name, age: '25_34', role: 'design', work: 'solo', team: 'solo',
      company: '', industry: 'it', industryOther: '', goals: ['learning'], tasks: ['image'],
      goalOther: '', taskOther: '', experience: 'new', agents: 'new', tools: ['none'],
      toolOther: '', automation: 'new',
    },
  };
}

/** The critical user journey exercises all five screens and proves a saved draft resumes. */
export async function completeOnboardingThroughUi(page: Page, name: string) {
  await expect(page).toHaveURL(/\/onboarding(?:\?|$)/u);
  const progress = page.getByRole('progressbar', { name: 'Прогресс анкеты' });
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByLabel('Как к вам обращаться?')).toHaveValue(name);
  for (const choice of ['25–34', 'Дизайн', 'Светлая']) {
    await page.getByRole('button', { name: choice, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  // Continuing saves the next step server-side; a reload must not restart the questionnaire.
  await page.reload();
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  const choices = [
    ['Работаю на себя', 'Только я', 'IT'],
    ['Учёба и эксперименты'],
    ['Изображения и фото'],
    ['Только начинаю', 'Пока не знаком', 'Пока не использую', 'Ещё не пробовал'],
  ];
  for (const [index, answers] of choices.entries()) {
    await expect(progress).toHaveAttribute('aria-valuenow', String(index + 1));
    for (const answer of answers) {
      await page.getByRole('button', { name: answer, exact: true }).click();
    }
    if (index < 3) await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  }
  const completion = page.waitForResponse((response) => response.request().method() === 'PATCH'
    && new URL(response.url()).pathname === '/api/account/onboarding'
    && response.request().postDataJSON()?.complete === true);
  await page.getByRole('button', { name: 'Открыть пространство', exact: true }).click();
  const response = await completion;
  expect(response.status()).toBe(200);
  const saved = await response.json() as OnboardingState;
  expect(saved.completedAt).toEqual(expect.any(String));
  expect(saved.legacyExempt).toBe(false);
  expect(saved.answers).toEqual(completedQaOnboarding(saved).answers);
  await expect(page).toHaveURL('/');
}

/** Editor tests use the same authenticated API while the critical spec covers its UI. */
export async function completeOnboardingThroughApi(page: Page) {
  const response = await page.request.get('/api/account/onboarding');
  expect(response.status()).toBe(200);
  const state = await response.json() as OnboardingState;
  expect(state.completedAt).toBeNull();
  const saved = await page.request.patch('/api/account/onboarding', {
    headers: { Origin: new URL(page.url()).origin, 'x-account-id': state.userId },
    data: completedQaOnboarding(state),
  });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({ completedAt: expect.any(String), legacyExempt: false });
}

/** Open/close the real help UI so automatic first-visit tours cannot race editor actions. */
export async function dismissSectionGuide(page: Page, section: SectionGuideId) {
  const skip = page.locator('.pui-onboarding-card__supplementary')
    .getByRole('button', { name: 'Пропустить онбординг', exact: true });
  if (!await skip.isVisible()) {
    await page.getByRole('button').and(page.locator(`[data-section-help="${section}"]`)).click();
  }
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(skip).toHaveCount(0);
  const hint = page.getByRole('dialog').filter({ hasText: 'Продолжить можно здесь' });
  if (await hint.isVisible()) await hint.getByRole('button', { name: 'Понятно', exact: true }).click();
}

const visitedQaSections = new WeakMap<Page, Set<SectionGuideId>>();

/** Editor checks start after the real first-visit help has been dismissed through its UI. */
export async function gotoQaSection(page: Page, href: string) {
  const response = await page.goto(href);
  const url = new URL(page.url());
  const section = sectionGuideForRoute(url.pathname, url.searchParams.get('type'), url.searchParams.get('view'));
  if (!section) return response;
  const visited = visitedQaSections.get(page) ?? new Set<SectionGuideId>();
  if (!visited.has(section)) {
    await dismissSectionGuide(page, section);
    visited.add(section);
    visitedQaSections.set(page, visited);
  }
  return response;
}

export async function createFlowFromHome(page: Page) {
  await dismissSectionGuide(page, 'home');
  await page.locator('.production-start-card[href="/create?type=flow"]').click();
  await expect(page).toHaveURL(/\/projects\/[^/?#]+(?:\?assistant=1)?$/u);
  const projectId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  expect(projectId).not.toBe('');
  await dismissSectionGuide(page, 'canvas');
  return projectId;
}
