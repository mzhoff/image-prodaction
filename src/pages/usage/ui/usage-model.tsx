import { ImageModelLogo } from '@/features/model-selector/ui/image-model-logo';
import { VideoModelLogo } from '@/features/model-selector/ui/video-model-logo';
export function UsageModel({ id, name, video }: { id: string; name: string; video: boolean }) {
  return <span className="usage-model-name">{video ? <VideoModelLogo modelKey={id} /> : <ImageModelLogo modelId={id} />}<span>{name}</span></span>;
}
