export const settingsSections = ['account', 'security', 'providers', 'integrations'] as const;

export type SettingsSection = typeof settingsSections[number];

export function isSettingsSection(value: string): value is SettingsSection {
  return settingsSections.includes(value as SettingsSection);
}
