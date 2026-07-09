import { getDb } from '../db';
import { v4 as uuidv4 } from './uuid';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { exists, mkdir, readFile, writeFile, remove } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';

function getMimeAndBase64(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function computeSha256(base64: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(base64);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function findMediaByHash(hash: string): Promise<string | null> {
  const db = getDb();
  const rows: any[] = await db.select(
    'SELECT id FROM media WHERE sha256_hash = ? LIMIT 1',
    [hash]
  );
  return rows.length > 0 ? rows[0].id : null;
}

let cachedMediaDir: string | null = null;

async function getMediaDir(): Promise<string> {
  if (cachedMediaDir) return cachedMediaDir;

  try {
    const appData = await appLocalDataDir();
    console.log('[media] appLocalDataDir:', appData);

    const mediaPath = await join(appData, 'media');
    console.log('[media] mediaPath:', mediaPath);

    const folderExists = await exists(mediaPath);
    console.log('[media] folderExists:', folderExists);

    if (!folderExists) {
      await mkdir(mediaPath, { recursive: true });
      console.log('[media] created folder:', mediaPath);
    }

    cachedMediaDir = mediaPath;
    return mediaPath;
  } catch (err) {
    console.error('[media] getMediaDir failed:', err);
    throw err;
  }
}

export async function saveMediaToDb(dataUrl: string, originalName?: string): Promise<string> {
  const parsed = getMimeAndBase64(dataUrl);
  if (!parsed) throw new Error('Invalid data URL');

  try {
    const hash = await computeSha256(parsed.base64);

    const existingId = await findMediaByHash(hash);
    if (existingId) return existingId;

    const db = getDb();
    
    let ext = '';
    let mimeType = parsed.mimeType;

    if (originalName) {
      const parts = originalName.split('.');
      if (parts.length > 1) {
        ext = parts.pop()?.toLowerCase() || '';
      }
    }

    if (ext) {
      mimeType = getMimeFromExtension(ext);
    } else {
      ext = getExtensionFromMime(mimeType);
    }

    const id = `${uuidv4()}.${ext}`;

    const mediaDir = await getMediaDir();
    const filePath = await join(mediaDir, id);
    const bytes = base64ToBytes(parsed.base64);
    await writeFile(filePath, bytes);
    console.log('[media] wrote file:', filePath, 'bytes:', bytes.length);

    await db.execute(
      'INSERT INTO media (id, data, mime_type, sha256_hash) VALUES (?, ?, ?, ?)',
      [id, `media/${id}`, mimeType, hash]
    );
    console.log('[media] inserted DB entry for:', id);

    return id;
  } catch (err) {
    console.error('[media] saveMediaToDb failed:', err);
    throw err;
  }
}

export async function getMediaDataUrl(mediaId: string): Promise<string> {
  const db = getDb();
  const rows: any[] = await db.select(
    'SELECT mime_type FROM media WHERE id = ?',
    [mediaId]
  );
  if (rows.length === 0) throw new Error(`Media ${mediaId} not found`);

  const { mime_type } = rows[0];

  // Read binary file from disk
  const mediaDir = await getMediaDir();
  const filePath = await join(mediaDir, mediaId);
  const bytes = await readFile(filePath);
  const base64 = bytesToBase64(new Uint8Array(bytes));
  return `data:${mime_type};base64,${base64}`;
}

export async function getMediaBytesAndMime(mediaId: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const db = getDb();
  const rows: any[] = await db.select(
    'SELECT mime_type FROM media WHERE id = ?',
    [mediaId]
  );
  if (rows.length === 0) throw new Error(`Media ${mediaId} not found`);

  const { mime_type } = rows[0];

  const mediaDir = await getMediaDir();
  const filePath = await join(mediaDir, mediaId);
  const bytes = await readFile(filePath);
  return { bytes: new Uint8Array(bytes), mimeType: mime_type };
}

export async function saveMediaBytesToDb(id: string, bytes: Uint8Array, mimeType: string): Promise<string> {
  try {
    const base64 = bytesToBase64(bytes);
    const hash = await computeSha256(base64);

    const existingId = await findMediaByHash(hash);
    if (existingId) return existingId;

    const db = getDb();
    const ext = getExtensionFromMime(mimeType);
    let finalId = id;
    if (!id.includes('.')) {
      finalId = `${id}.${ext}`;
    }

    const mediaDir = await getMediaDir();
    const filePath = await join(mediaDir, finalId);
    await writeFile(filePath, bytes);
    console.log('[media] wrote file from bytes:', filePath, 'bytes:', bytes.length);

    await db.execute(
      'INSERT INTO media (id, data, mime_type, sha256_hash) VALUES (?, ?, ?, ?)',
      [finalId, `media/${finalId}`, mimeType, hash]
    );
    console.log('[media] inserted DB entry for byte-saved:', finalId);

    return finalId;
  } catch (err) {
    console.error('[media] saveMediaBytesToDb failed:', err);
    throw err;
  }
}

export async function deleteMediaFromDb(mediaId: string): Promise<void> {
  const db = getDb();
  try {
    await db.execute('DELETE FROM media WHERE id = ?', [mediaId]);

    // Also delete file from disk
    const mediaDir = await getMediaDir();
    const filePath = await join(mediaDir, mediaId);
    if (await exists(filePath)) {
      await remove(filePath);
    }
  } catch (err) {
    console.error(`Error deleting media ${mediaId}:`, err);
  }
}

export async function migrateMediaHashes(): Promise<void> {
  const db = getDb();

  // 1. First migrate existing SQLite base64 records to disk
  try {
    const rows: any[] = await db.select(
      'SELECT id, data, mime_type FROM media WHERE data IS NOT NULL AND data != ""'
    );
    if (rows.length > 0) {
      console.log(`Migrating ${rows.length} media items from SQLite to disk...`);
      const mediaDir = await getMediaDir();
      for (const row of rows) {
        try {
          const filePath = await join(mediaDir, row.id);
          const bytes = base64ToBytes(row.data);
          await writeFile(filePath, bytes);
          await db.execute('UPDATE media SET data = ? WHERE id = ?', [`media/${row.id}`, row.id]);
        } catch (err) {
          console.error(`Failed to migrate media item ${row.id} to disk:`, err);
        }
      }
    }
  } catch (e) {
    console.warn('Media database to disk migration failed:', e);
  }

  // 2. Perform original media hash migration
  try {
    const rows: any[] = await db.select(
      'SELECT id, data FROM media WHERE sha256_hash IS NULL'
    );
    for (const row of rows) {
      let base64Data = row.data;
      if (!base64Data) {
        // Try reading from disk
        try {
          const mediaDir = await getMediaDir();
          const filePath = await join(mediaDir, row.id);
          const bytes = await readFile(filePath);
          base64Data = bytesToBase64(new Uint8Array(bytes));
        } catch (err) { console.warn('[media] Could not read disk file for hash migration, row id:', row.id, err); }
      }
      if (!base64Data) continue;
      const hash = await computeSha256(base64Data);
      await db.execute(
        'UPDATE media SET sha256_hash = ? WHERE id = ?',
        [hash, row.id]
      );
    }
  } catch (e) {
    console.warn('Media hash migration skipped:', e);
  }
}

export async function deleteMediaForTask(mediaIds: string[]): Promise<void> {
  if (mediaIds.length === 0) return;
  const db = getDb();
  const placeholders = mediaIds.map(() => '?').join(',');
  try {
    await db.execute(`DELETE FROM media WHERE id IN (${placeholders})`, mediaIds);

    // Also delete files from disk
    const mediaDir = await getMediaDir();
    for (const mediaId of mediaIds) {
      const filePath = await join(mediaDir, mediaId);
      if (await exists(filePath)) {
        await remove(filePath);
      }
    }
  } catch (err) {
    console.error('Error deleting media for task:', err);
  }
}

function collectMediaIds(files: { mediaId?: string }[]): string[] {
  return files.map(f => f.mediaId).filter(Boolean) as string[];
}

export { collectMediaIds };

export async function migrateMediaFromFs(): Promise<void> {
  try {
    const { appLocalDataDir } = await import('@tauri-apps/api/path');
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const appData = await appLocalDataDir();
    const mediaDir = `${appData}media/`;

    const db = getDb();
    const targetMediaDir = await getMediaDir();

    // Migrate profiles with dataURL icons
    const profiles: any[] = await db.select('SELECT id, icon FROM profiles');
    for (const p of profiles) {
      if (!p.icon) continue;
      if (p.icon.startsWith('data:')) {
        const parsed = getMimeAndBase64(p.icon);
        if (parsed) {
          const mediaId = uuidv4();
          const bytes = base64ToBytes(parsed.base64);
          const filePath = await join(targetMediaDir, mediaId);
          await writeFile(filePath, bytes);
          await db.execute(
            'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
            [mediaId, `media/${mediaId}`, parsed.mimeType]
          );
          await db.execute('UPDATE profiles SET icon = ? WHERE id = ?', [mediaId, p.id]);
        } else {
          await db.execute('UPDATE profiles SET icon = NULL WHERE id = ?', [p.id]);
        }
      }
    }

    // Migrate projects with filesystem icon paths
    const projects: any[] = await db.select('SELECT id, icon_media_path FROM projects');
    for (const proj of projects) {
      if (!proj.icon_media_path) continue;
      if (proj.icon_media_path.startsWith('media/')) {
        const filename = proj.icon_media_path.replace(/^media\//, '');
        try {
          const bytes = await readFile(`${mediaDir}${filename}`);
          const ext = filename.split('.').pop()?.toLowerCase() || '';
          const mimeMap: Record<string, string> = {
            'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
            'bmp': 'image/bmp', 'pdf': 'application/pdf'
          };
          const mimeType = mimeMap[ext] || 'application/octet-stream';
          const mediaId = uuidv4();

          const filePath = await join(targetMediaDir, mediaId);
          await writeFile(filePath, new Uint8Array(bytes));

          await db.execute(
            'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
            [mediaId, `media/${mediaId}`, mimeType]
          );
          await db.execute('UPDATE projects SET icon_media_path = ? WHERE id = ?', [mediaId, proj.id]);
        } catch {
          // Try reading as old UUID path format
        }
      }
    }

    // Migrate tasks with filesystem relativePath in file JSON arrays
    const tasks: any[] = await db.select('SELECT id, instruction_files_json, solution_files_json FROM tasks');
    for (const t of tasks) {
      let changed = false;
      let instFiles = t.instruction_files_json ? JSON.parse(t.instruction_files_json) : [];
      let solFiles = t.solution_files_json ? JSON.parse(t.solution_files_json) : [];

      for (const file of instFiles) {
        if (file.relativePath && !file.mediaId) {
          const filename = file.relativePath.replace(/^media\//, '');
          try {
            const bytes = await readFile(`${mediaDir}${filename}`);
            const ext = filename.split('.').pop()?.toLowerCase() || '';
            const mimeMap: Record<string, string> = {
              'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
              'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
              'bmp': 'image/bmp', 'pdf': 'application/pdf'
            };
            const mimeType = mimeMap[ext] || 'application/octet-stream';
            const mediaId = uuidv4();

            const filePath = await join(targetMediaDir, mediaId);
            await writeFile(filePath, new Uint8Array(bytes));

            await db.execute(
              'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
              [mediaId, `media/${mediaId}`, mimeType]
            );
            file.mediaId = mediaId;
            delete file.relativePath;
            changed = true;
          } catch {
            delete file.relativePath;
            changed = true;
          }
        }
      }

      for (const file of solFiles) {
        if (file.relativePath && !file.mediaId) {
          const filename = file.relativePath.replace(/^media\//, '');
          try {
            const bytes = await readFile(`${mediaDir}${filename}`);
            const ext = filename.split('.').pop()?.toLowerCase() || '';
            const mimeMap: Record<string, string> = {
              'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
              'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
              'bmp': 'image/bmp', 'pdf': 'application/pdf'
            };
            const mimeType = mimeMap[ext] || 'application/octet-stream';
            const mediaId = uuidv4();

            const filePath = await join(targetMediaDir, mediaId);
            await writeFile(filePath, new Uint8Array(bytes));

            await db.execute(
              'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
              [mediaId, `media/${mediaId}`, mimeType]
            );
            file.mediaId = mediaId;
            delete file.relativePath;
            changed = true;
          } catch {
            delete file.relativePath;
            changed = true;
          }
        }
      }

      if (changed) {
        await db.execute(
          'UPDATE tasks SET instruction_files_json = ?, solution_files_json = ? WHERE id = ?',
          [JSON.stringify(instFiles), JSON.stringify(solFiles), t.id]
        );
      }
    }

    // Migrate custom_backgrounds with filesystem paths
    const bgs: any[] = await db.select('SELECT id, relative_path, icon FROM custom_backgrounds');
    for (const bg of bgs) {
      if (bg.relative_path && bg.relative_path.startsWith('media/')) {
        const filename = bg.relative_path.replace(/^media\//, '');
        try {
          const bytes = await readFile(`${mediaDir}${filename}`);
          const ext = filename.split('.').pop()?.toLowerCase() || '';
          const mimeMap: Record<string, string> = {
            'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
            'bmp': 'image/bmp', 'pdf': 'application/pdf'
          };
          const mimeType = mimeMap[ext] || 'application/octet-stream';
          const mediaId = uuidv4();

          const filePath = await join(targetMediaDir, mediaId);
          await writeFile(filePath, new Uint8Array(bytes));

          await db.execute(
            'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
            [mediaId, `media/${mediaId}`, mimeType]
          );
          await db.execute('UPDATE custom_backgrounds SET relative_path = ? WHERE id = ?', [mediaId, bg.id]);
        } catch (err) { console.warn('[media] Migration: failed to migrate background file:', err); }
      }
      if (bg.icon && bg.icon !== bg.relative_path && bg.icon.startsWith('media/')) {
        const iconFilename = bg.icon.replace(/^media\//, '');
        try {
          const bytes = await readFile(`${mediaDir}${iconFilename}`);
          const ext = iconFilename.split('.').pop()?.toLowerCase() || '';
          const mimeMap: Record<string, string> = {
            'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
            'bmp': 'image/bmp', 'pdf': 'application/pdf'
          };
          const mimeType = mimeMap[ext] || 'application/octet-stream';
          const iconMediaId = uuidv4();

          const filePath = await join(targetMediaDir, iconMediaId);
          await writeFile(filePath, new Uint8Array(bytes));

          await db.execute(
            'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
            [iconMediaId, `media/${iconMediaId}`, mimeType]
          );
          await db.execute('UPDATE custom_backgrounds SET icon = ? WHERE id = ?', [iconMediaId, bg.id]);
        } catch (err) { console.warn('[media] Migration: failed to migrate background icon:', err); }
      }
    }
  } catch (e) {
    console.warn('Media migration skipped:', e);
  }
}

export function isAudioFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'].includes(ext);
}

export function isVideoFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v', 'mkv', '3gp', 'flv'].includes(ext);
}

export function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext);
}

export function getFileIcon(name: string): string {
  const lowercaseName = name.toLowerCase();
  if (lowercaseName.endsWith('.pdf')) return 'picture_as_pdf';
  if (lowercaseName.endsWith('.txt') || lowercaseName.endsWith('.md')) return 'description';
  if (isAudioFile(name)) return 'audio_file';
  if (isVideoFile(name)) return 'video_library';
  if (isImageFile(name)) return 'image';
  return 'insert_drive_file';
}

export function isIntegratedFile(name: string): boolean {
  const lowercaseName = name.toLowerCase();
  return (
    lowercaseName.endsWith('.pdf') ||
    lowercaseName.endsWith('.txt') ||
    lowercaseName.endsWith('.md') ||
    isAudioFile(name) ||
    isVideoFile(name) ||
    isImageFile(name)
  );
}

export async function openAttachmentInDefaultApp(file: { name: string; dataUrl?: string; mediaId?: string }): Promise<void> {
  try {
    if (!file.mediaId) {
      throw new Error('No media ID provided');
    }

    const mediaDir = await getMediaDir();
    const filePath = await join(mediaDir, file.mediaId);
    if (!(await exists(filePath))) {
      throw new Error(`Media file ${file.mediaId} not found on disk`);
    }

    await invoke('open_file', { path: filePath });
  } catch (err) {
    console.error('[media] openAttachmentInDefaultApp failed:', err);
    throw err;
  }
}

export function getMimeFromExtension(ext: string): string {
  const extMap: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'aac': 'audio/aac',
    'm4a': 'audio/m4a',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogv': 'video/ogg',
    'mov': 'video/quicktime',
    'pdf': 'application/pdf',
    'md': 'text/markdown',
    'txt': 'text/plain',
    'json': 'application/json',
    'zip': 'application/zip',
    'xml': 'application/xml',
  };
  return extMap[ext.toLowerCase()] || `custom/${ext.toLowerCase()}`;
}

export function getExtensionFromMime(mimeType: string): string {
  if (mimeType.toLowerCase().startsWith('custom/')) {
    return mimeType.split('/').pop() || 'bin';
  }
  const mimeMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/x-icon': 'ico',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
    'audio/m4a': 'm4a',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
    'text/markdown': 'md',
    'text/plain': 'txt',
    'application/json': 'json',
    'application/zip': 'zip',
    'application/xml': 'xml',
  };
  return mimeMap[mimeType.toLowerCase()] || 'bin';
}

export async function migrateMediaExtensions(): Promise<void> {
  const db = getDb();

  // 1. Fetch all media entries
  const rows: any[] = await db.select('SELECT id, mime_type FROM media');
  const migrationMap = new Map<string, string>();

  for (const row of rows) {
    const oldId = row.id;
    if (oldId && !oldId.includes('.')) {
      const ext = getExtensionFromMime(row.mime_type);
      const newId = `${oldId}.${ext}`;
      migrationMap.set(oldId, newId);
    }
  }

  if (migrationMap.size === 0) return;
  console.log(`[media-migration] Found ${migrationMap.size} files to migrate.`);

  const mediaDir = await getMediaDir();

  // 2. Process each file migration
  for (const [oldId, newId] of migrationMap.entries()) {
    try {
      const oldFilePath = await join(mediaDir, oldId);
      const newFilePath = await join(mediaDir, newId);

      if (await exists(oldFilePath)) {
        const bytes = await readFile(oldFilePath);
        await writeFile(newFilePath, bytes);
        await remove(oldFilePath);
      }

      // Update media table
      await db.execute(
        'UPDATE media SET id = ?, data = ? WHERE id = ?',
        [newId, `media/${newId}`, oldId]
      );

      // Update profiles
      await db.execute(
        'UPDATE profiles SET icon = ? WHERE icon = ?',
        [newId, oldId]
      );

      // Update projects
      await db.execute(
        'UPDATE projects SET icon_media_path = ? WHERE icon_media_path = ?',
        [newId, oldId]
      );

      // Update custom backgrounds
      await db.execute(
        'UPDATE custom_backgrounds SET relative_path = ? WHERE relative_path = ?',
        [newId, oldId]
      );
      await db.execute(
        'UPDATE custom_backgrounds SET icon = ? WHERE icon = ?',
        [newId, oldId]
      );
    } catch (err) {
      console.error(`[media-migration] Failed to migrate media entry ${oldId}:`, err);
    }
  }

  // 3. Update task files (which are JSON structures)
  try {
    const tasks: any[] = await db.select('SELECT id, instruction_files_json, solution_files_json FROM tasks');
    for (const task of tasks) {
      let instUpdated = false;
      let solUpdated = false;

      let instFiles = [];
      try {
        instFiles = JSON.parse(task.instruction_files_json || '[]');
      } catch (_) {}

      let solFiles = [];
      try {
        solFiles = JSON.parse(task.solution_files_json || '[]');
      } catch (_) {}

      if (Array.isArray(instFiles)) {
        instFiles.forEach((file: any) => {
          if (file && file.mediaId && migrationMap.has(file.mediaId)) {
            file.mediaId = migrationMap.get(file.mediaId)!;
            instUpdated = true;
          }
        });
      }

      if (Array.isArray(solFiles)) {
        solFiles.forEach((file: any) => {
          if (file && file.mediaId && migrationMap.has(file.mediaId)) {
            file.mediaId = migrationMap.get(file.mediaId)!;
            solUpdated = true;
          }
        });
      }

      if (instUpdated || solUpdated) {
        await db.execute(
          'UPDATE tasks SET instruction_files_json = ?, solution_files_json = ? WHERE id = ?',
          [JSON.stringify(instFiles), JSON.stringify(solFiles), task.id]
        );
      }
    }
  } catch (err) {
    console.error('[media-migration] Failed to migrate tasks references:', err);
  }

  // 4. Update settings userIcons
  try {
    const settingsRows: any[] = await db.select('SELECT data_json FROM settings WHERE id = 1');
    if (settingsRows.length > 0) {
      const settings = JSON.parse(settingsRows[0].data_json);
      if (settings.userIcons && Array.isArray(settings.userIcons)) {
        let settingsUpdated = false;
        settings.userIcons = settings.userIcons.map((iconId: string) => {
          if (migrationMap.has(iconId)) {
            settingsUpdated = true;
            return migrationMap.get(iconId)!;
          }
          return iconId;
        });

        if (settingsUpdated) {
          await db.execute('UPDATE settings SET data_json = ? WHERE id = 1', [JSON.stringify(settings)]);
        }
      }
    }
  } catch (err) {
    console.error('[media-migration] Failed to migrate settings references:', err);
  }

  console.log('[media-migration] Completed successfully.');
}
