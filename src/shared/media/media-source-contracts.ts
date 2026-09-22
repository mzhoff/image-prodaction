/** Server-created file reference. Never deserialize paths supplied by a client. */
export interface MediaFile { path: string; byteLength: number; header: Uint8Array; checksumSha256: string }
export type MediaSource = Uint8Array | MediaFile;
