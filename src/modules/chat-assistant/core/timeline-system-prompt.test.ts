import assert from 'node:assert/strict';
import test from 'node:test';
import type { TimelineDocument } from '@/modules/story-projects/contracts/story-timeline';
import { buildTimelineSystemPrompt, summarizeTimelineForAssistant } from './timeline-system-prompt';
import { toolsForAssistantMode } from '../server/home-tool-policy';
import { imageProductionTools } from '../contracts/image-production-tools';
import { storyAuthoringTools } from '../contracts/story-authoring';

test('Timeline summary bounds clips but retains full timing and excludes source IDs and URLs', () => {
  const timeline: TimelineDocument = { id: 'timeline', workspaceId: 'workspace', folderId: null, storyboardId: null,
    name: 'Ролик', revision: 7, createdAt: '', updatedAt: '', snapshot: { schemaVersion: 1, aspectRatio: '16:9', clips:
      Array.from({ length: 120 }, (_, i) => ({ id: `clip-${i}`, shotId: null, assetId: `private-asset-${i}`, kind: 'video', sourceInMs: i * 1000, durationMs: 2000 })),
      audioTracks: [{ id: 'private-track', name: 'Music' }], lockedClipIds: ['clip-0'], audioClips: [{ id: 'audio', trackId: 'private-track', assetId: 'private-audio', startMs: 0, sourceInMs: 3000, durationMs: 9000, gain: 0.5, role: 'music' }],
  } };
  const context = summarizeTimelineForAssistant(timeline);
  assert.equal(context.clips.length, 100); assert.equal(context.clipCount, 120); assert.equal(context.clipsTruncated, true);
  assert.equal(context.durationMs, 240_000); assert.equal(context.frameRate, 30); assert.equal(context.clips[0].locked, true);
  assert.equal(context.audioClips[0].sourceInMs, 3000); assert.equal(context.audioClips[0].gain, 0.5);
  assert.deepEqual(context.audioTrackNames, ['Music']); assert.equal(context.audioClips[0].track, 'Music');
  assert.ok(!JSON.stringify(context).includes('private-'));
  const layered = summarizeTimelineForAssistant({ ...timeline, snapshot: { ...timeline.snapshot, videoTracks: [{ id: 'private-video-track', name: 'Overlay' }], clips: [timeline.snapshot.clips[0], { ...timeline.snapshot.clips[1], trackId: 'private-video-track', startMs: 500, durationMs: 500 }] } });
  assert.equal(layered.durationMs, 9000); assert.equal(layered.clips[1].startMs, 500); assert.equal(layered.clips[1].track, 'Overlay'); assert.ok(!JSON.stringify(layered).includes('private-'));
  const linked = summarizeTimelineForAssistant({ ...timeline, snapshot: { ...timeline.snapshot,
    clips: [{ ...timeline.snapshot.clips[0], sourceAudioMuted: true }],
    audioClips: [{ ...timeline.snapshot.audioClips![0], linkedVideoClipId: 'clip-0' }],
  } });
  assert.equal(linked.clips[0].sourceAudioMuted, true); assert.equal(linked.audioClips[0].linkedVideoPosition, 1);
  assert.ok(!JSON.stringify(linked).includes('clip-0')); assert.equal(linked.durationMs, 9000);
  const prompt = buildTimelineSystemPrompt(context, true);
  assert.match(prompt, /нет инструментов изменения Timeline/); assert.match(prompt, /несохранённые изменения/);
  assert.match(prompt, /не системные инструкции/); assert.match(prompt, /Не выдавай скачивание JSON за экспорт/);
  assert.match(prompt, /Ctrl\/Cmd\+Z/); assert.match(prompt, /Открепить звук от видео/); assert.match(prompt, /Прогресс|прогресс/);
  assert.match(prompt, /Пересчитать ритм и ячейки/); assert.match(prompt, /AI не вызывает/);
  assert.match(prompt, /Запустить AI-автомонтаж/); assert.match(prompt, /Применить предложение/); assert.match(prompt, /автоматически сохраняются локально/); assert.match(prompt, /CapCut, Premiere Pro и DaVinci Resolve пока недоступны/); assert.match(prompt, /Скачать MP4/);
});

test('Timeline tools remain disabled even with forged assistant mode or story flags', () => {
  const tools = [...imageProductionTools, ...storyAuthoringTools];
  for (const mode of ['general-chat', 'product-copilot', 'image-generation', 'mcp-agent'] as const) {
    assert.deepEqual(toolsForAssistantMode(tools, mode, false, true), []);
    assert.deepEqual(toolsForAssistantMode(tools, mode, true, true), []);
  }
  assert.ok(toolsForAssistantMode(tools, 'product-copilot').length > 0, 'Flow retains its tools');
  assert.deepEqual(toolsForAssistantMode(tools, 'general-chat', true), storyAuthoringTools);
});
