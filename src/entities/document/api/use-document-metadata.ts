'use client';

import { useCallback, useState, type RefObject } from 'react';
import { updateDocumentProjectMetadata } from './document-api';

export function useDocumentMetadata(projectId: string | undefined, discardCandidateRef: RefObject<string | null>) {
  const [documentName, setDocumentName] = useState<string>();
  const [favorite, setFavorite] = useState(false);
  const [documentStatus, setDocumentStatus] = useState<'active' | 'trash'>('active');
  const updateMetadata = useCallback(async (metadata: {
    favorite?: boolean;
    name?: string;
    status?: 'active' | 'trash';
  }) => {
    if (!projectId) throw new Error('Document is not connected to the backend.');
    discardCandidateRef.current = null;
    const project = await updateDocumentProjectMetadata(projectId, metadata);
    setDocumentName(project.name);
    setFavorite(project.favorite);
    setDocumentStatus(project.status);
    return project;
  }, [discardCandidateRef, projectId]);

  return {
    documentName, favorite, documentStatus,
    setDocumentName, setFavorite, setDocumentStatus,
    renameDocument: (name: string) => updateMetadata({ name }),
    setDocumentFavorite: (favorite: boolean) => updateMetadata({ favorite }),
    moveDocumentToTrash: () => updateMetadata({ status: 'trash' }),
  };
}
