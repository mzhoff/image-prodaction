'use client';

import { useEffect, useState } from 'react';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';
import type { TimelineSummary } from '@/modules/story-projects/contracts/story-timeline';
import { loadTimelines } from '@/pages/stories/model/timeline-api';
import { loadStories } from '@/pages/stories/model/story-api';

export function useWorkspaceStories(workspaceId?: string) {
  const [result, setResult] = useState<{ workspaceId: string; stories: StorySummary[]; timelines: TimelineSummary[]; error: boolean } | null>(null);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    void Promise.all([loadStories(workspaceId, controller.signal), loadTimelines(workspaceId, controller.signal)])
      .then(([{ stories }, { timelines }]) => { if (!controller.signal.aborted) setResult({ workspaceId, stories, timelines, error: false }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ workspaceId, stories: [], timelines: [], error: true }); });
    return () => controller.abort();
  }, [workspaceId]);
  return result?.workspaceId === workspaceId ? result : null;
}
