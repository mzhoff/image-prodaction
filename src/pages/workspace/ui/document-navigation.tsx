'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { workspaceReturnHref } from '../model/document-window';

const RETURN_KEY = 'production.document.return.v1';
export const DocumentReturnContext = createContext('/');
export const useDocumentReturnHref = () => useContext(DocumentReturnContext);

export function useWorkspaceReturnHref(route: string, focused: boolean) {
  const [href, setHref] = useState('/');
  useEffect(() => {
    if (focused) {
      try { setHref(workspaceReturnHref(sessionStorage.getItem(RETURN_KEY))); } catch { /* Storage is optional. */ }
    } else {
      const next = workspaceReturnHref(route);
      setHref(next);
      try { sessionStorage.setItem(RETURN_KEY, next); } catch { /* Keep in-memory navigation. */ }
    }
  }, [route, focused]);
  return href;
}
