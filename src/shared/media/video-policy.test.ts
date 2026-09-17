import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_VIDEO_BYTES, videoDeriveOptionsSchema } from './video-contracts';
import { detectVideoContainer, parseVideoProbe, validateVideoEnvelope, videoInputArguments } from './video-inspection';
import { assertExtractedAudioDuration, selectVideoAudioTrack } from './video-processor';
import { readVideoMultipart, withVideoUploadLimit } from './video-upload-request';

function mp4(brand = 'isom') { const bytes = Buffer.alloc(24); bytes.write('ftyp', 4); bytes.write(brand, 8); return bytes; }
function probe() { return { format: { duration: '2' }, streams: [
  { index: 0, codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', width: 640, height: 360, avg_frame_rate: '30/1', duration: '2' },
  { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '48000', duration: '2', disposition: { default: 1 }, tags: { language: 'rus', title: 'Original' } },
] }; }
test('video signatures and declared MIME are independent of file names; arbitrary containers are rejected', () => {
  assert.equal(detectVideoContainer(mp4()), 'mp4'); assert.equal(detectVideoContainer(mp4('qt  ')), 'mov');
  const webm = Buffer.alloc(24); webm.writeUInt32BE(0x1a45dfa3); Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]).copy(webm, 5);
  assert.equal(detectVideoContainer(webm), 'webm');
  assert.throws(() => detectVideoContainer(mp4('avif')), { code: 'unsupported_video' });
  assert.throws(() => detectVideoContainer(Buffer.from('#EXTM3U\nhttp://private/secret')), { code: 'unsupported_video' });
  assert.throws(() => validateVideoEnvelope(mp4(), { claimedContentType: 'video/quicktime' }), { code: 'content_type_mismatch' });
  assert.equal(validateVideoEnvelope(mp4(), { claimedContentType: 'video/mp4; codecs=avc1' }), 'mp4');
  assert.throws(() => validateVideoEnvelope(mp4(), { maxBytes: 10 }), { code: 'file_too_large' });
  const args = videoInputArguments('mp4', '/owned/source');
  assert.equal(args[args.indexOf('-protocol_whitelist') + 1], 'file,pipe');
  assert.equal(args[args.indexOf('-enable_drefs') + 1], '0');
  assert.equal(args[args.indexOf('-use_absolute_path') + 1], '0');
});
test('video metadata validates streams, dimensions, duration, fps and codec before decoding', () => {
  const checked = parseVideoProbe(probe(), 'mp4');
  assert.equal(checked.browserPlayable, true); assert.equal(checked.audioTracks[0]?.language, 'rus');
  assert.throws(() => parseVideoProbe({ ...probe(), format: { duration: '1801' } }, 'mp4'), { code: 'video_duration_limit' });
  const tooLarge = probe(); tooLarge.streams[0]!.width = 4097;
  assert.throws(() => parseVideoProbe(tooLarge, 'mp4'), { code: 'unsupported_video_parameters' });
  const badRate = probe(); badRate.streams[0]!.avg_frame_rate = '0/0';
  assert.throws(() => parseVideoProbe(badRate, 'mp4'), { code: 'unsupported_video_parameters' });
  const badCodec = probe(); badCodec.streams[0]!.codec_name = 'hls';
  assert.throws(() => parseVideoProbe(badCodec, 'mp4'), { code: 'unsupported_video_codec' });
  const noVideo = probe(); noVideo.streams.shift();
  assert.throws(() => parseVideoProbe(noVideo, 'mp4'), { code: 'unsupported_video_streams' });
  const twoVideos = probe(); twoVideos.streams.push({ ...twoVideos.streams[0]!, index: 3 });
  assert.throws(() => parseVideoProbe(twoVideos, 'mp4'), { code: 'unsupported_video_streams' });
  const duplicateTrack = probe(); duplicateTrack.streams.push({ ...duplicateTrack.streams[1]! });
  assert.throws(() => parseVideoProbe(duplicateTrack, 'mp4'), { code: 'invalid_video' });
  const hevc = probe(); hevc.streams[0]!.codec_name = 'hevc';
  assert.equal(parseVideoProbe(hevc, 'mp4').browserPlayable, false);
});
test('track selection is explicit, defaults are stable and missing audio is never invented', () => {
  const checked = parseVideoProbe(probe(), 'mp4');
  checked.audioTracks.push({ ...checked.audioTracks[0]!, index: 3, isDefault: false, language: 'eng' });
  assert.equal(selectVideoAudioTrack(checked).index, 1); assert.equal(selectVideoAudioTrack(checked, 3).language, 'eng');
  assert.throws(() => selectVideoAudioTrack(checked, 2), { code: 'video_audio_track_not_found' });
  assert.throws(() => selectVideoAudioTrack({ ...checked, audioTracks: [] }), { code: 'video_has_no_audio' });
  assert.equal(videoDeriveOptionsSchema.safeParse({ kind: 'video-only', audioTrackIndex: 1 }).success, false);
  assert.equal(videoDeriveOptionsSchema.safeParse({ kind: 'audio', audioTrackIndex: -1 }).success, false);
  assert.equal(videoDeriveOptionsSchema.safeParse({ kind: 'audio', url: 'http://private/secret' }).success, false);
});
test('extracted audio must match its measured duration even when video metadata cannot supply track duration', () => {
  const input = probe(); input.streams[0]!.codec_name = 'vp9'; input.streams[1]!.codec_name = 'opus';
  const { duration: _duration, ...trackWithoutDuration } = input.streams[1]!;
  const checked = parseVideoProbe({ ...input, streams: [input.streams[0]!, trackWithoutDuration] }, 'webm');
  assert.equal(checked.audioTracks[0]?.durationSeconds, undefined);
  assert.doesNotThrow(() => assertExtractedAudioDuration(119.98, 120));
  assert.throws(() => assertExtractedAudioDuration(85, 120), { code: 'video_output_limit' });
  assert.throws(() => assertExtractedAudioDuration(0, 120), { code: 'video_output_limit' });
  assert.throws(() => assertExtractedAudioDuration(100, Number.NaN), { code: 'video_output_limit' });
});
test('video multipart body is bounded and rejects duplicate or unsupported fields', async () => {
  await assert.rejects(readVideoMultipart(new Request('http://local', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(MAX_VIDEO_BYTES + 2 * 1024 * 1024) }, body: 'x' }), ['file']), { code: 'file_too_large' });
  const form = new FormData(); form.set('file', new File([mp4()], 'test.mp4', { type: 'video/mp4' }));
  form.set('requestedAssetId', 'attacker-choice');
  await assert.rejects(readVideoMultipart(new Request('http://local', { method: 'POST', body: form }), ['file']), { code: 'invalid_upload_field' });
  form.delete('requestedAssetId'); form.append('file', new File([mp4()], 'other.mp4'));
  await assert.rejects(readVideoMultipart(new Request('http://local', { method: 'POST', body: form }), ['file']), { code: 'invalid_upload_field' });
  form.delete('file'); form.set('file', new File([mp4()], 'test.mp4'));
  assert.equal((await readVideoMultipart(new Request('http://local', { method: 'POST', body: form }), ['file'])).file.size, 24);
});
test('video uploads share one bounded slot and release it on success and failure', async () => {
  let release!: () => void;
  const first = withVideoUploadLimit(() => new Promise<void>((resolve) => { release = resolve; }));
  await assert.rejects(withVideoUploadLimit(async () => 1), { code: 'video_upload_busy' }); release(); await first;
  await assert.rejects(withVideoUploadLimit(async () => { throw new Error('failed'); }));
  assert.equal(await withVideoUploadLimit(async () => 2), 2);
});
