'use client';
import { useEffect, useState } from 'react';
import type { VideoModelCapabilities } from '@/shared/media/video-generation-contracts';
import { loadVideoModels } from '@/shared/api/video-model-catalog';

export function useVideoModels() {
  const [models, setModels] = useState<VideoModelCapabilities[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void loadVideoModels().then((value) => { if (active) { setModels(value); setError(''); } }, (error: Error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [revision]);
  return { models, error, reload: () => setRevision((n) => n + 1) };
}
