import { notFound } from 'next/navigation';
import { isSettingsSection, SettingsDialog } from '@/pages/settings';
import { requirePageSession } from '@/shared/auth/session';

interface SettingsDialogRouteProps {
  params: Promise<{ section: string }>;
}

export default async function SettingsDialogRoute({ params }: SettingsDialogRouteProps) {
  const [{ section }] = await Promise.all([params, requirePageSession()]);
  if (!isSettingsSection(section)) notFound();
  return <SettingsDialog section={section} />;
}
