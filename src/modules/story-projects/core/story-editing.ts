import type { StoryClip, StorySnapshot } from '../contracts/story-project';

/** Editing storyboard structure never touches separately stored timelines. */
export function removeStoryScene(story: StorySnapshot, sceneId: string): StorySnapshot {
  return { ...story, scenes: story.scenes.filter((scene) => scene.id !== sceneId) };
}
export function removeStoryShot(story: StorySnapshot, shotId: string): StorySnapshot {
  return { ...story, scenes: story.scenes.map((scene) => ({ ...scene, shots: scene.shots.filter((shot) => shot.id !== shotId) })) };
}
export function reorderStoryClips(clips: StoryClip[], id: string, destination: number): StoryClip[] {
  const from = clips.findIndex((clip) => clip.id === id);
  if (from < 0 || destination < 0 || destination >= clips.length) return clips;
  const next = [...clips]; const [clip] = next.splice(from, 1); next.splice(destination, 0, clip);
  return next;
}
export function timelinePositions(clips: StoryClip[]) {
  let startMs = 0;
  return clips.map((clip) => { const position = { ...clip, startMs }; startMs += clip.durationMs; return position; });
}
export function storyAssetRequirements(story: StorySnapshot) {
  const requirements: { id: string; kind: 'image' | 'video'; endMs?: number }[] = [];
  for (const character of story.characters ?? []) for (const id of character.references) requirements.push({ id, kind: 'image' });
  for (const scene of story.scenes) for (const shot of scene.shots) {
    if (shot.imageAssetId) requirements.push({ id: shot.imageAssetId, kind: 'image' });
    if (shot.videoAssetId) requirements.push({ id: shot.videoAssetId, kind: 'video' });
  }
  return requirements;
}

export function clipAssetRequirements(clips: StoryClip[]) {
  return clips.map((clip) => ({ id: clip.assetId, kind: clip.kind,
    ...(clip.kind === 'video' ? { endMs: clip.sourceInMs + clip.durationMs } : {}) }));
}
