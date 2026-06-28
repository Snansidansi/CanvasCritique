import { getDb } from '../db';
import { v4 as uuidv4 } from './uuid';

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

export async function saveMediaToDb(dataUrl: string): Promise<string> {
  const parsed = getMimeAndBase64(dataUrl);
  if (!parsed) throw new Error('Invalid data URL');

  const db = getDb();
  const id = uuidv4();
  const bytes = base64ToBytes(parsed.base64);

  await db.execute(
    'INSERT INTO media (id, data, mime_type, name) VALUES (?, ?, ?, ?)',
    [id, bytes, parsed.mimeType, id]
  );

  return id;
}

export async function getMediaDataUrl(mediaId: string): Promise<string> {
  const db = getDb();
  const rows: any[] = await db.select(
    'SELECT data, mime_type FROM media WHERE id = ?',
    [mediaId]
  );
  if (rows.length === 0) throw new Error(`Media ${mediaId} not found`);

  const { data, mime_type } = rows[0];
  const base64 = bytesToBase64(new Uint8Array(data));
  return `data:${mime_type};base64,${base64}`;
}

export async function deleteMediaFromDb(mediaId: string): Promise<void> {
  const db = getDb();
  try {
    await db.execute('DELETE FROM media WHERE id = ?', [mediaId]);
  } catch {
    // Ignore if doesn't exist
  }
}

export async function migrateMediaFromFs(): Promise<void> {
  try {
    const { appLocalDataDir } = await import('@tauri-apps/api/path');
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const appData = await appLocalDataDir();
    const mediaDir = `${appData}media/`;

    const db = getDb();

    // Migrate profiles with dataURL icons
    const profiles: any[] = await db.select('SELECT id, icon FROM profiles');
    for (const p of profiles) {
      if (!p.icon) continue;
      if (p.icon.startsWith('data:')) {
        const parsed = getMimeAndBase64(p.icon);
        if (parsed) {
          const mediaId = uuidv4();
          const bytes = base64ToBytes(parsed.base64);
          await db.execute(
            'INSERT OR IGNORE INTO media (id, data, mime_type, name) VALUES (?, ?, ?, ?)',
            [mediaId, bytes, parsed.mimeType, p.id]
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
          await db.execute(
            'INSERT OR IGNORE INTO media (id, data, mime_type, name) VALUES (?, ?, ?, ?)',
            [mediaId, bytes, mimeType, proj.id]
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
            await db.execute(
              'INSERT OR IGNORE INTO media (id, data, mime_type, name) VALUES (?, ?, ?, ?)',
              [mediaId, bytes, mimeType, file.name || filename]
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
            await db.execute(
              'INSERT OR IGNORE INTO media (id, data, mime_type, name) VALUES (?, ?, ?, ?)',
              [mediaId, bytes, mimeType, file.name || filename]
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
          await db.execute(
            'INSERT OR IGNORE INTO media (id, data, mime_type, name) VALUES (?, ?, ?, ?)',
            [mediaId, bytes, mimeType, bg.name || filename]
          );
          await db.execute('UPDATE custom_backgrounds SET relative_path = ? WHERE id = ?', [mediaId, bg.id]);
        } catch {}
      } else {
        // Not a media/ path - might already be migrated or a UUID
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
          await db.execute(
            'INSERT OR IGNORE INTO media (id, data, mime_type, name) VALUES (?, ?, ?, ?)',
            [iconMediaId, bytes, mimeType, bg.name || iconFilename]
          );
          await db.execute('UPDATE custom_backgrounds SET icon = ? WHERE id = ?', [iconMediaId, bg.id]);
        } catch {}
      }
    }
  } catch (e) {
    console.warn('Media migration skipped:', e);
  }
}
