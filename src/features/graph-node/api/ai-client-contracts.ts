export interface AnalyzeImageRequest {
  imageDataUrl: string;
  model: string;
  prompt: string;
}

export interface GenerateImageRequest {
  aspectRatio: string;
  documentId: string;
  idempotencyKey: string;
  inputs: Record<string, string[]>;
  model: string;
  prompt: string;
  referenceImages: Array<{
    dataUrl: string;
    slots: string[];
    sourceAssetId?: string;
    sourceNodeTypes?: string[];
  }>;
  size: string;
  locationInputs?: string[];
  subjectInputs?: string[];
  workspaceId: string;
}

export interface EditImageRequest {
  aspectRatio: string;
  documentId: string;
  idempotencyKey: string;
  imageDataUrl: string;
  maskDataUrl: string;
  model: string;
  prompt: string;
  size: string;
  workspaceId: string;
}

export interface RefineImageRequest {
  aspectRatio: string;
  documentId: string;
  idempotencyKey: string;
  imageDataUrl: string;
  instruction: string;
  mode: string;
  model: string;
  preserveStrength: string;
  size: string;
  workspaceId: string;
}

export interface GenerateTextRequest {
  inputText: string;
  instruction: string;
  model: string;
  outputStyle: string;
  reasoning?: 'low' | 'medium' | 'high';
  temperature?: number;
}

export interface GenerateSpeechRequest {
  inputText: string;
  language: 'auto' | 'ru' | 'en' | 'de' | 'es' | 'zh';
  model: string;
  responseFormat: 'mp3' | 'pcm';
  seed?: number;
  speed?: number;
  temperature?: number;
  topP?: number;
  voice: string;
}

export interface FormatTelegramTextRequest {
  inputText: string;
  model: string;
  rulesText?: string;
}

export interface SubjectDescriptionDraft {
  identitySummary?: string;
  immutableTraits?: string;
  mutableAttributes?: string;
  name?: string;
  negativeConstraints?: string;
  notes?: string;
  subjectType?: string;
}

export interface LocationDescriptionDraft {
  atmosphere?: string;
  description?: string;
  locationType?: string;
  mutableAttributes?: string;
  name?: string;
  negativeConstraints?: string;
  notes?: string;
  spatialLayout?: string;
}

export interface DescribeSubjectRequest {
  imageDataUrls: string[];
  model: string;
  subjectType: string;
  textNotes?: string[];
}

export interface DescribeLocationRequest {
  imageDataUrls: string[];
  locationType: string;
  model: string;
  textNotes?: string[];
}

export interface RemoveBackgroundRequest {
  imageDataUrl: string;
}

export interface GenerationRequestOptions {
  onJobAccepted?: (jobId: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}
