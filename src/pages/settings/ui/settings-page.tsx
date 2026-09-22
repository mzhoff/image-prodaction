'use client';

import { SectionOnboardingProvider } from '@/features/section-onboarding/ui/section-onboarding-provider';

import type { SettingsSection } from '../model/settings-section';
import { SettingsPanel } from './settings-panel';

export function SettingsPage({ section }: { section: SettingsSection }) {
  return (
    <SectionOnboardingProvider><main className="settings-page">
      <SettingsPanel section={section} presentation="page" />
    </main></SectionOnboardingProvider>
  );
}
