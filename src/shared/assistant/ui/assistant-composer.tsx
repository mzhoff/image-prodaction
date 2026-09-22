'use client';

import type { ComponentProps, ReactNode } from 'react';
import { ChatComposer } from '@prodactionpro/chat-ui';

export function AssistantComposer({ parameters, tools, materials, ...props }: ComponentProps<typeof ChatComposer> & {
  parameters?: ReactNode; tools?: ReactNode; materials?: ReactNode;
}) {
  return <div className="assistant-composer">
    {materials ? <div className="cm-composer-attachment-content">{materials}</div> : null}
    <ChatComposer {...props} keyboardPolicy="focused" showMicButton={false} />
    {parameters || tools ? <div className="assistant-composer-options"><div className="assistant-composer-parameters">{parameters}</div><div className="assistant-composer-tools">{tools}</div></div> : null}
  </div>;
}
