import { z } from 'zod';

export const ONBOARDING_STEPS = ['about', 'work', 'goals', 'tasks', 'experience'] as const;
export type OnboardingStep = typeof ONBOARDING_STEPS[number];
export const answerOptions = {
  age: ['under18', '18_24', '25_34', '35_44', '45_54', '55plus'],
  role: ['design', 'marketing', 'creator', 'video', 'founder', 'expert', 'student', 'other'],
  work: ['solo', 'company', 'business', 'agency', 'personal'],
  team: ['solo', '2_3', '4_5', '6_10', '11_50', '51plus'],
  industry: ['commerce', 'services', 'education', 'media', 'it', 'creative', 'other'],
  goals: ['packaging', 'design', 'marketing', 'blog', 'brand', 'clients', 'team', 'learning', 'other'],
  tasks: ['image', 'video', 'motion', 'editing', 'audio', 'writing', 'planning', 'slides', 'web', 'automation', 'other'],
  experience: ['new', 'tried', 'regular', 'workflow'],
  agents: ['new', 'heard', 'use', 'build'],
  tools: ['chatgpt', 'claude', 'antigravity', 'codex', 'cursor', 'other', 'none'],
  automation: ['new', 'templates', 'build'],
} as const;
const optionalChoice = <T extends readonly [string, ...string[]]>(values: T) => z.union([z.enum(values), z.literal('')]);
const textAnswer = z.string().trim().max(160);
export const onboardingAnswersSchema = z.object({
  name: textAnswer, age: optionalChoice(answerOptions.age), role: optionalChoice(answerOptions.role),
  // Keep accepting old drafts, but company names are no longer collected.
  work: optionalChoice(answerOptions.work), team: optionalChoice(answerOptions.team), company: textAnswer.default('').transform(() => ''),
  industry: optionalChoice(answerOptions.industry),
  // An explicit free-text answer for the "Other" industry; old drafts default to empty.
  industryOther: textAnswer.default(''),
  goals: z.array(z.enum(answerOptions.goals)).max(9), tasks: z.array(z.enum(answerOptions.tasks)).max(11),
  goalOther: textAnswer, taskOther: textAnswer,
  experience: optionalChoice(answerOptions.experience), agents: optionalChoice(answerOptions.agents),
  tools: z.array(z.enum(answerOptions.tools)).max(7), toolOther: textAnswer,
  automation: optionalChoice(answerOptions.automation),
}).strict();
export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>;
export type OnboardingField = keyof typeof answerOptions;
export type OnboardingLocale = 'ru' | 'en';
export type OnboardingTheme = 'light' | 'dark' | 'system';
export type OnboardingState = {
  userId: string; version: number; step: OnboardingStep; answers: OnboardingAnswers;
  locale: OnboardingLocale; theme: OnboardingTheme; revision: number;
  completedAt: string | null; legacyExempt: boolean; returnTo: string;
};
export function emptyOnboarding(userId: string, name = ''): OnboardingState {
  return { userId, version: 1, step: 'about', revision: 0, locale: 'ru', theme: 'system', completedAt: null,
    legacyExempt: false, returnTo: '/', answers: { name: name.slice(0, 160), age: '', role: '', work: '', team: '',
      company: '', industry: '', industryOther: '', goals: [], tasks: [], goalOther: '', taskOther: '', experience: '', agents: '',
      tools: [], toolOther: '', automation: '' } };
}
export function stepMissing(step: OnboardingStep, a: OnboardingAnswers): string[] {
  const needed: string[] = [];
  const require = (field: keyof OnboardingAnswers) => { const value = a[field]; if (!(typeof value === 'string' ? value.trim() : value)?.length) needed.push(field); };
  if (step === 'about') { require('name'); require('age'); require('role'); }
  if (step === 'work') {
    require('work'); require('team');
    if (a.work && a.work !== 'personal') {
      require('industry');
      if (a.industry === 'other') require('industryOther');
    }
  }
  if (step === 'goals') require('goals');
  if (step === 'tasks') require('tasks');
  if (step === 'experience') { require('experience'); require('agents'); require('tools'); require('automation'); }
  return needed;
}
export function normalizeAnswers(answers: OnboardingAnswers): OnboardingAnswers {
  return { ...answers, name: answers.name.trim(), company: '',
    industry: answers.work === 'personal' ? '' : answers.industry,
    industryOther: answers.work !== 'personal' && answers.industry === 'other' ? answers.industryOther.trim() : '',
    goals: [...new Set(answers.goals)], tasks: [...new Set(answers.tasks)],
    tools: answers.tools.includes('none') ? ['none'] : [...new Set(answers.tools)],
    goalOther: answers.goals.includes('other') ? answers.goalOther : '',
    taskOther: answers.tasks.includes('other') ? answers.taskOther : '',
    toolOther: answers.tools.includes('other') && !answers.tools.includes('none') ? answers.toolOther : '' };
}
export const onboardingChangeSchema = z.object({
  revision: z.number().int().nonnegative(), step: z.enum(ONBOARDING_STEPS), answers: onboardingAnswersSchema,
  locale: z.enum(['ru', 'en']), theme: z.enum(['light', 'dark', 'system']), complete: z.boolean().optional(),
  returnTo: z.string().max(2048).optional(),
}).strict();
export type OnboardingChange = z.infer<typeof onboardingChangeSchema>;
export class OnboardingConflict extends Error {}
export class OnboardingInvalid extends Error {}
