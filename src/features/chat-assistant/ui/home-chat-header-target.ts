'use client';

import { createContext } from 'react';

/** The page owns header placement; the conversation retains its action lifecycle. */
export const HomeChatHeaderTarget = createContext<HTMLDivElement | null>(null);
