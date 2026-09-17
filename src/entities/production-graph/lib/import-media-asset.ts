import { getImportMediaKind } from '@/shared/lib/import-media-file';
import { saveUploadedImageAsset, type ImageUploadOptions } from './asset-db';
import { saveUploadedAudioAsset } from './remote-audio-asset';
import { getActiveAssetScope } from './remote-asset';
import { uploadRemoteVideoAsset } from './remote-video-asset';

export async function saveImportedMediaAsset(file: File, scope = getActiveAssetScope(), onStage?: ImageUploadOptions['onStage']) {
  const kind = getImportMediaKind(file);
  if (kind === 'image') return saveUploadedImageAsset(file, { scope, onStage });
  if (!kind) throw new Error('Choose an image, audio, or MP4/MOV/WebM video file.');
  if (!scope) throw new Error('Open a saved project before uploading audio or video.');
  onStage?.('uploading');
  return kind === 'audio' ? saveUploadedAudioAsset(file, scope) : uploadRemoteVideoAsset(file, scope);
}
