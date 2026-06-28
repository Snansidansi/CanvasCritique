import { appDataDir } from '@tauri-apps/api/path';
import { writeFile, readFile, remove } from '@tauri-apps/plugin-fs';
import { v4 as uuidv4 } from './uuid';

let mediaDirCache: string | null = null;

async function getMediaDir(): Promise<string> {
  if (mediaDirCache) return mediaDirCache;
  const appData = await appDataDir();
  mediaDirCache = `${appData}media/`;
  return mediaDirCache;
}

export async function initMediaDir(): Promise<void> {
  const dir = await getMediaDir();
  try {
    await writeFile(dir, new Uint8Array());
  } catch {
    // Directory already exists or will be created on first write
  }
}

function getMimeAndBase64(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'application/pdf': 'pdf'
  };
  return map[mimeType] || 'bin';
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function saveMediaFile(dataUrl: string): Promise<string> {
  const parsed = getMimeAndBase64(dataUrl);
  if (!parsed) throw new Error('Invalid data URL');

  const ext = getExtension(parsed.mimeType);
  const filename = `${uuidv4()}.${ext}`;
  const relativePath = `media/${filename}`;

  const mediaDir = await getMediaDir();
  const filePath = `${mediaDir}${filename}`;
  const bytes = base64ToBytes(parsed.base64);
  await writeFile(filePath, bytes);

  return relativePath;
}

export async function readMediaFile(relativePath: string): Promise<string> {
  const mediaDir = await getMediaDir();
  const filePath = `${mediaDir}${relativePath.replace(/^media\//, '')}`;
  const bytes = await readFile(filePath);

  const ext = relativePath.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'pdf': 'application/pdf',
    'bin': 'application/octet-stream'
  };
  const mimeType = mimeMap[ext] || 'application/octet-stream';
  const base64 = bytesToBase64(bytes);
  return `data:${mimeType};base64,${base64}`;
}

export async function deleteMediaFile(relativePath: string): Promise<void> {
  const mediaDir = await getMediaDir();
  const filePath = `${mediaDir}${relativePath.replace(/^media\//, '')}`;
  try {
    await remove(filePath);
  } catch {
    // Ignore if file doesn't exist
  }
}
