export const QR_CODE_DEFAULTS = {
  backgroundColor: '#FFFFFF',
  contentMode: 'url',
  errorCorrectionLevel: 'M',
  foregroundColor: '#000000',
  margin: 4,
  outputFormat: 'png',
  pixelSize: 1024,
} as const satisfies QrCodeOptions;

export const QR_CODE_LIMITS = {
  maxContentBytes: 2_048,
} as const;

export type QrCodeContentMode = 'text' | 'url';
export type QrCodeErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrCodeOptions {
  backgroundColor: '#FFFFFF';
  contentMode: QrCodeContentMode;
  errorCorrectionLevel: 'M';
  foregroundColor: '#000000';
  margin: 4;
  outputFormat: 'png';
  pixelSize: 1024;
}

export class QrCodeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrCodeValidationError';
  }
}

export function normalizeQrCodeContent(
  input: unknown,
  mode: QrCodeContentMode,
): string {
  if (typeof input !== 'string') throw validationError('QR content must be text.');
  const content = input.trim();
  if (!content) throw validationError('QR content is required.');
  if (hasControlCharacters(content)) {
    throw validationError('QR content contains unsupported control characters.');
  }
  if (new TextEncoder().encode(content).byteLength > QR_CODE_LIMITS.maxContentBytes) {
    throw validationError('QR content is too long.');
  }
  if (mode === 'url') validateQrCodeUrl(content);
  return content;
}

export function normalizeQrCodeOptions(input: Record<string, unknown>): QrCodeOptions {
  return {
    backgroundColor: readFixedColor(input.backgroundColor, QR_CODE_DEFAULTS.backgroundColor),
    contentMode: readContentMode(input.contentMode),
    errorCorrectionLevel: readFixedProfileValue(
      input.errorCorrectionLevel,
      QR_CODE_DEFAULTS.errorCorrectionLevel,
      'QR error correction level is fixed to M in V1.',
    ),
    foregroundColor: readFixedColor(input.foregroundColor, QR_CODE_DEFAULTS.foregroundColor),
    margin: readFixedProfileValue(
      input.margin,
      QR_CODE_DEFAULTS.margin,
      'QR margin is fixed to 4 in V1.',
    ),
    outputFormat: readOutputFormat(input.outputFormat),
    pixelSize: readFixedProfileValue(
      input.pixelSize,
      QR_CODE_DEFAULTS.pixelSize,
      'QR image size is fixed to 1024 pixels in V1.',
    ),
  };
}

function readOutputFormat(value: unknown): 'png' {
  if (value === undefined || value === null || value === '' || value === 'png') return 'png';
  throw validationError('QR output format is not supported.');
}

export function isQrCodeHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function validateQrCodeUrl(content: string) {
  let url: URL;
  try {
    url = new URL(content);
  } catch {
    throw validationError('QR URL must be an absolute HTTP or HTTPS URL.');
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
    throw validationError('QR URL must be an absolute HTTP or HTTPS URL.');
  }
  if (url.username || url.password) {
    throw validationError('QR URL must not contain embedded credentials.');
  }
}

function readContentMode(value: unknown): QrCodeContentMode {
  if (value === undefined || value === null || value === '') return QR_CODE_DEFAULTS.contentMode;
  if (value === 'url' || value === 'text') return value;
  throw validationError('QR content mode is invalid.');
}

function readFixedColor<T extends '#000000' | '#FFFFFF'>(value: unknown, expected: T): T {
  if (value === undefined || value === null || value === '') return expected;
  if (isQrCodeHexColor(value) && value.toUpperCase() === expected) return expected;
  throw validationError(`QR color is fixed to ${expected} in V1.`);
}

function readFixedProfileValue<T extends string | number>(
  value: unknown,
  expected: T,
  message: string,
): T {
  if (value === undefined || value === null || value === '') return expected;
  if (value === expected) return expected;
  throw validationError(message);
}

function hasControlCharacters(value: string) {
  return /[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function validationError(message: string) {
  return new QrCodeValidationError(message);
}
