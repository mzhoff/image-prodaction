'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectExport } from '@/entities/production-graph/model/project-schema';
import type { StudioPipelinePublication } from '../../contracts/pipeline-publication-contracts';
import {
  fetchStudioPipelinePublications,
  publishStudioPipelineSection,
} from './studio-publication-api';

export function useStudioPipelinePublications(input: {
  exportSnapshot: () => ProjectExport;
  projectId?: string;
}) {
  const { exportSnapshot, projectId } = input;
  const [publications, setPublications] = useState<StudioPipelinePublication[]>([]);
  const [publishingSectionIds, setPublishingSectionIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!projectId) {
      setPublications([]);
      return undefined;
    }
    const controller = new AbortController();
    void fetchStudioPipelinePublications(projectId, controller.signal)
      .then(setPublications)
      .catch((error) => {
        if (!controller.signal.aborted) console.error('Could not load executable pipelines', error);
      });
    return () => controller.abort();
  }, [projectId]);

  const publishSection = useCallback(async (sectionId: string) => {
    if (!projectId) throw new Error('Сначала сохрани документ в рабочем пространстве.');
    setPublishingSectionIds((current) => new Set(current).add(sectionId));
    try {
      const publication = await publishStudioPipelineSection(
        projectId,
        sectionId,
        exportSnapshot(),
      );
      setPublications((current) => [
        publication,
        ...current.filter((item) => item.sectionId !== sectionId),
      ]);
      return publication;
    } finally {
      setPublishingSectionIds((current) => {
        const next = new Set(current);
        next.delete(sectionId);
        return next;
      });
    }
  }, [exportSnapshot, projectId]);

  const publicationsBySectionId = useMemo(() => new Map(
    publications.map((publication) => [publication.sectionId, publication]),
  ), [publications]);

  return {
    publications,
    publicationsBySectionId,
    publishingSectionIds,
    publishSection,
  };
}
