import { spawnSync } from 'node:child_process';
import { PROJECT_SCHEMA_VERSION, type ProjectExport } from '../src/entities/production-graph/model/project-schema';

export const videoQaCapability = 'qa.video.extract';

/** CI supplies ffmpeg directly; local QA can use its existing image without pull/build. */
export function runQaFfmpeg(args: string[]) {
  const binary = process.env.FFMPEG_PATH || 'ffmpeg';
  const installed = spawnSync(binary, ['-version'], { stdio: 'ignore' }).status === 0;
  const generated = spawnSync(installed ? binary : 'docker', installed ? args : ['run', '--rm', '--name', 'image-prodaction-video-fixture', '--pull', 'never',
    '--network', 'none', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--memory', '256m', '--cpus', '1', '--pids-limit', '64',
    '--entrypoint', 'ffmpeg', 'image-prodaction-web', ...args], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  if (generated.status !== 0 || !generated.stdout.length) throw new Error('Synthetic video fixture generation failed; process output omitted.');
  return generated.stdout;
}

export function createVideoQaFixture() {
  return runQaFfmpeg(['-nostdin', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=10:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-map', '0:v:0', '-map', '1:a:0',
    '-threads', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', '2',
    '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1']);
}

export function videoQaForm(bytes: Uint8Array, workspaceId: string, documentId?: string) {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }), 'video-qa-synthetic.mp4');
  form.set('workspaceId', workspaceId);
  if (documentId) form.set('documentId', documentId);
  return form;
}

export function createVideoQaSnapshot(assetId: string, audioTrackIndex: number): ProjectExport {
  return {
    kind: 'projectSnapshot', schemaVersion: PROJECT_SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    assetsManifest: [], uiState: { nodes: {}, sections: {}, viewport: { x: 0, y: 0, zoom: 1 } },
    project: {
      version: PROJECT_SCHEMA_VERSION,
      nodes: [
        { id: 'input', type: 'pipelineInput', data: { title: 'Input', fields: [{ id: 'note', key: 'note', kind: 'text', required: false }] },
          position: { x: 50, y: 100 }, size: { width: 280, height: 300 }, status: 'idle' },
        { id: 'import', type: 'importImage', data: { title: 'Import', assetId, mediaKind: 'video', videoAudioTrackIndex: audioTrackIndex },
          position: { x: 450, y: 100 }, size: { width: 280, height: 400 }, status: 'idle' },
        { id: 'output', type: 'pipelineOutput', data: { title: 'Output', fields: [
          { id: 'original', key: 'original', kind: 'video', required: true }, { id: 'video', key: 'video', kind: 'video', required: true },
          { id: 'audio', key: 'audio', kind: 'audio', required: true },
        ] }, position: { x: 850, y: 100 }, size: { width: 280, height: 300 }, status: 'idle' },
      ],
      edges: ['original', 'video', 'audio'].map((port) => ({ id: `import-output-${port}`, sourceNodeId: 'import', sourcePortId: port, targetNodeId: 'output', targetPortId: `field:${port}` })),
      sections: [{ id: 'video-qa', title: 'Video Runtime QA — original, silent, audio', capabilityKey: videoQaCapability,
        position: { x: 0, y: 0 }, size: { width: 1300, height: 700 } }],
      assets: [], presets: [], subjects: [], locations: [], publications: [], runs: [], selectedNodeIds: [], selectedSectionIds: [],
    },
  };
}
