import { getMediaBytesAndMime } from '../db/media';

async function compressData(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data as any).body
    ?.pipeThrough(new CompressionStream('gzip'));
  if (!stream) throw new Error('Failed to create compression stream');
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function decompressData(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data as any).body
    ?.pipeThrough(new DecompressionStream('gzip'));
  if (!stream) throw new Error('Failed to create decompression stream');
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function createPack(jsonHeader: any, mediaIds: string[]): Promise<Uint8Array> {
  const uniqueMediaIds = Array.from(new Set(mediaIds)).filter(Boolean);
  const mediaItems: Array<{ id: string; bytes: Uint8Array; mimeType: string }> = [];

  for (const id of uniqueMediaIds) {
    try {
      const data = await getMediaBytesAndMime(id);
      if (data) {
        mediaItems.push({ id, bytes: data.bytes, mimeType: data.mimeType });
      }
    } catch (e) {
      console.error(`[ccpack] Failed to fetch media for packing: ${id}`, e);
    }
  }

  // Assign offsets and populate metadata
  const mediaMeta: Array<{ id: string; mimeType: string; offset: number; size: number }> = [];
  let currentOffset = 0;
  for (const item of mediaItems) {
    mediaMeta.push({
      id: item.id,
      mimeType: item.mimeType,
      offset: currentOffset,
      size: item.bytes.length
    });
    currentOffset += item.bytes.length;
  }

  // Embed media metadata in the JSON header
  const headerWithMedia = {
    ...jsonHeader,
    _media: mediaMeta
  };

  const headerStr = JSON.stringify(headerWithMedia);
  const headerBytes = new TextEncoder().encode(headerStr);

  // Total size: 4 (magic) + 2 (version) + 4 (header length) + headerBytes.length + totalMediaBytes
  const totalMediaBytes = currentOffset;
  const totalSize = 10 + headerBytes.length + totalMediaBytes;
  const buffer = new Uint8Array(totalSize);

  // Write Magic Bytes 'CCPK'
  buffer[0] = 0x43; // C
  buffer[1] = 0x43; // C
  buffer[2] = 0x50; // P
  buffer[3] = 0x4B; // K

  // Write Version [1, 0]
  buffer[4] = 1;
  buffer[5] = 0;

  // Write Header Length (32-bit big endian)
  const view = new DataView(buffer.buffer);
  view.setUint32(6, headerBytes.length, false);

  // Write Header Bytes
  buffer.set(headerBytes, 10);

  // Write Media Bytes
  let writeOffset = 10 + headerBytes.length;
  for (const item of mediaItems) {
    buffer.set(item.bytes, writeOffset);
    writeOffset += item.bytes.length;
  }

  // Compress using CompressionStream
  return await compressData(buffer);
}

export async function parsePack(packBytes: Uint8Array): Promise<{ jsonHeader: any; mediaItems: Array<{ id: string; bytes: Uint8Array; mimeType: string }> }> {
  // Check if compressed
  let data = packBytes;
  if (packBytes.length >= 2 && packBytes[0] === 0x1f && packBytes[1] === 0x8b) {
    data = await decompressData(packBytes);
  }

  if (data.length < 10) {
    throw new Error('Invalid package file: too short');
  }

  // Verify Magic Bytes
  if (data[0] !== 0x43 || data[1] !== 0x43 || data[2] !== 0x50 || data[3] !== 0x4B) {
    throw new Error('Invalid package file: magic bytes mismatch');
  }

  // Read Header Length
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerLength = view.getUint32(6, false);

  if (data.length < 10 + headerLength) {
    throw new Error('Invalid package file: truncated header');
  }

  // Decode JSON Header
  const headerBytes = data.subarray(10, 10 + headerLength);
  const headerStr = new TextDecoder().decode(headerBytes);
  const jsonHeader = JSON.parse(headerStr);

  const mediaItems: Array<{ id: string; bytes: Uint8Array; mimeType: string }> = [];
  const mediaMeta = jsonHeader._media || [];

  const mediaPayloadStart = 10 + headerLength;
  for (const meta of mediaMeta) {
    const start = mediaPayloadStart + meta.offset;
    const end = start + meta.size;
    if (end > data.length) {
      throw new Error(`Invalid package file: truncated media data for ID ${meta.id}`);
    }
    const bytes = data.subarray(start, end);
    mediaItems.push({
      id: meta.id,
      bytes: new Uint8Array(bytes),
      mimeType: meta.mimeType
    });
  }

  // Remove the internal _media metadata from the returned header object to keep it clean
  const { _media, ...cleanHeader } = jsonHeader;

  return { jsonHeader: cleanHeader, mediaItems };
}
