'use client';

import type { ReactNode } from 'react';

export function AssistantNotice({ action, actionLabel, children }: {
  action?: () => void;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="assistant-chat-notice" role="status">
      <p>{children}</p>
      {action ? <button onClick={action} type="button">{actionLabel}</button> : null}
    </div>
  );
}

export function compactModelLabel(model: string) {
  return model.split('/').at(-1) ?? model;
}
