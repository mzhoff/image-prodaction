'use client';

import { Onboarding } from '@prodactionpro/ui-onboarding/client';
import type { OnboardingProps } from '@prodactionpro/ui-onboarding';
import '@prodactionpro/ui-onboarding/styles.css';
import './onboarding-dialog.css';

/** Shared presentation; hosts provide scenarios and first-visit persistence. */
export function OnboardingDialog(props: OnboardingProps) {
  return <Onboarding {...props} />;
}
