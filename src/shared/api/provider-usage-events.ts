export const PROVIDER_USAGE_UPDATED_EVENT = 'reverie:provider-usage-updated';

export interface ProviderUsageUpdatedDetail {
  workspaceId: string;
}

export function notifyProviderUsageUpdated(workspaceId: string) {
  if (typeof window === 'undefined' || !workspaceId) return;
  window.dispatchEvent(new CustomEvent<ProviderUsageUpdatedDetail>(
    PROVIDER_USAGE_UPDATED_EVENT,
    { detail: { workspaceId } },
  ));
}
