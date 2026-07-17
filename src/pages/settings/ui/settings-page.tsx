'use client';

import type { SettingsSection } from '../model/settings-section';
import { SettingsPanel } from './settings-panel';

export function SettingsPage({ section }: { section: SettingsSection }) {
  return (
    <main className="settings-page">
      <SettingsPanel section={section} presentation="page" />
    </main>
  );
}
