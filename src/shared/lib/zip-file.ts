export interface ZipFileEntry {
  blob: Blob;
  path: string;
}

const ZIP_MIME_TYPE = 'application/zip';
const UTF_8_FLAG = 0x0800;
const STORE_METHOD = 0;
const VERSION_NEEDED = 20;

let crcTable: Uint32Array | null = null;

export async function createZipBlob(entries: ZipFileEntry[], now = new Date()) {
  if (entries.length === 0) throw new Error('Нет файлов для zip-экспорта.');

  const fileParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  const dosDateTime = getDosDateTime(now);
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(normalizeZipPath(entry.path));
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(data);
    const localHeader = createLocalFileHeader({
      crc,
      dataLength: data.length,
      nameBytes,
      dosDateTime,
    });
    const centralHeader = createCentralDirectoryHeader({
      crc,
      dataLength: data.length,
      nameBytes,
      dosDateTime,
      localHeaderOffset: offset,
    });

    fileParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + getBlobPartLength(part), 0);
  const endRecord = createEndOfCentralDirectoryRecord({
    centralDirectoryOffset,
    centralDirectorySize,
    entriesCount: entries.length,
  });

  return new Blob([...fileParts, ...centralParts, endRecord], { type: ZIP_MIME_TYPE });
}

function createLocalFileHeader(params: {
  crc: number;
  dataLength: number;
  dosDateTime: DosDateTime;
  nameBytes: Uint8Array;
}) {
  const { crc, dataLength, dosDateTime, nameBytes } = params;
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);
  writeU32(view, 0, 0x04034b50);
  writeU16(view, 4, VERSION_NEEDED);
  writeU16(view, 6, UTF_8_FLAG);
  writeU16(view, 8, STORE_METHOD);
  writeU16(view, 10, dosDateTime.time);
  writeU16(view, 12, dosDateTime.date);
  writeU32(view, 14, crc);
  writeU32(view, 18, dataLength);
  writeU32(view, 22, dataLength);
  writeU16(view, 26, nameBytes.length);
  writeU16(view, 28, 0);
  header.set(nameBytes, 30);
  return header;
}

function createCentralDirectoryHeader(params: {
  crc: number;
  dataLength: number;
  dosDateTime: DosDateTime;
  localHeaderOffset: number;
  nameBytes: Uint8Array;
}) {
  const { crc, dataLength, dosDateTime, localHeaderOffset, nameBytes } = params;
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);
  writeU32(view, 0, 0x02014b50);
  writeU16(view, 4, VERSION_NEEDED);
  writeU16(view, 6, VERSION_NEEDED);
  writeU16(view, 8, UTF_8_FLAG);
  writeU16(view, 10, STORE_METHOD);
  writeU16(view, 12, dosDateTime.time);
  writeU16(view, 14, dosDateTime.date);
  writeU32(view, 16, crc);
  writeU32(view, 20, dataLength);
  writeU32(view, 24, dataLength);
  writeU16(view, 28, nameBytes.length);
  writeU16(view, 30, 0);
  writeU16(view, 32, 0);
  writeU16(view, 34, 0);
  writeU16(view, 36, 0);
  writeU32(view, 38, 0);
  writeU32(view, 42, localHeaderOffset);
  header.set(nameBytes, 46);
  return header;
}

function createEndOfCentralDirectoryRecord(params: {
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  entriesCount: number;
}) {
  const { centralDirectoryOffset, centralDirectorySize, entriesCount } = params;
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  writeU32(view, 0, 0x06054b50);
  writeU16(view, 4, 0);
  writeU16(view, 6, 0);
  writeU16(view, 8, entriesCount);
  writeU16(view, 10, entriesCount);
  writeU32(view, 12, centralDirectorySize);
  writeU32(view, 16, centralDirectoryOffset);
  writeU16(view, 20, 0);
  return record;
}

function crc32(data: Uint8Array) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = (crc >>> 8) ^ table[(crc ^ data[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getCrcTable() {
  if (crcTable) return crcTable;

  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

interface DosDateTime {
  date: number;
  time: number;
}

function getDosDateTime(date: Date): DosDateTime {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function normalizeZipPath(path: string) {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .join('/') || 'file';
}

function writeU16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function getBlobPartLength(part: BlobPart) {
  if (part instanceof Blob) return part.size;
  if (typeof part === 'string') return new TextEncoder().encode(part).length;
  return part.byteLength;
}
