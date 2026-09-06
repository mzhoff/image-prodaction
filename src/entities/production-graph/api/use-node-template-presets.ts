'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  createNodeTemplateSnapshot,
  nodeTemplateSnapshotsEqual,
  type NodeTemplatePreset,
} from '@/entities/production-graph/model/node-template-preset';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import {
  createNodeTemplate,
  deleteNodeTemplate,
  fetchNodeTemplates,
} from './node-template-api';

export function useNodeTemplatePresets(workspaceId?: string) {
  const [templates, setTemplates] = useState<NodeTemplatePreset[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId) {
      setTemplates([]);
      setError(undefined);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setError(undefined);
    setLoading(true);
    void fetchNodeTemplates(workspaceId, controller.signal)
      .then((next) => setTemplates(next))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : 'Could not load Templates.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId]);

  const findMatchingTemplate = useCallback((node: Pick<ProductionNode, 'data' | 'type'>) => {
    const snapshot = createNodeTemplateSnapshot(node);
    return templates.find((template) => nodeTemplateSnapshotsEqual(template.snapshot, snapshot));
  }, [templates]);

  const saveTemplate = useCallback(async (node: Pick<ProductionNode, 'data' | 'type'>) => {
    if (!workspaceId) throw new Error('Workspace is not ready yet.');
    const result = await createNodeTemplate(workspaceId, node);
    setTemplates((current) => [
      result.template,
      ...current.filter((template) => template.id !== result.template.id),
    ]);
    return result;
  }, [workspaceId]);

  const removeTemplate = useCallback(async (templateId: string) => {
    if (!workspaceId) throw new Error('Workspace is not ready yet.');
    await deleteNodeTemplate(workspaceId, templateId);
    setTemplates((current) => current.filter((template) => template.id !== templateId));
  }, [workspaceId]);

  return {
    error,
    findMatchingTemplate,
    loading,
    removeTemplate,
    saveTemplate,
    templates,
  };
}
