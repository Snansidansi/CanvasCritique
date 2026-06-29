import { getDb } from '../db';
import { v4 as uuidv4 } from './uuid';

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

export async function saveMediaToDb(dataUrl: string): Promise<string> {
  const parsed = getMimeAndBase64(dataUrl);
  if (!parsed) throw new Error('Invalid data URL');

  const hash = await computeSha256(parsed.base64);

  const existingId = await findMediaByHash(hash);
  if (existingId) return existingId;

  const db = getDb();
  const id = uuidv4();

  await db.execute(
    'INSERT INTO media (id, data, mime_type, sha256_hash) VALUES (?, ?, ?, ?)',
    [id, parsed.base64, parsed.mimeType, hash]
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
  return `data:${mime_type};base64,${data}`;
}

export async function deleteMediaFromDb(mediaId: string): Promise<void> {
  const db = getDb();
  try {
    await db.execute('DELETE FROM media WHERE id = ?', [mediaId]);
  } catch {
    // Ignore if doesn't exist
  }
}

export async function migrateMediaHashes(): Promise<void> {
  try {
    const db = getDb();
    const rows: any[] = await db.select(
      'SELECT id, data FROM media WHERE sha256_hash IS NULL'
    );
    for (const row of rows) {
      if (!row.data) continue;
      const hash = await computeSha256(row.data);
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
  } catch {
    // Ignore if doesn't exist
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

    // Migrate profiles with dataURL icons
    const profiles: any[] = await db.select('SELECT id, icon FROM profiles');
    for (const p of profiles) {
      if (!p.icon) continue;
      if (p.icon.startsWith('data:')) {
        const parsed = getMimeAndBase64(p.icon);
        if (parsed) {
          const mediaId = uuidv4();
          await db.execute(
            'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
            [mediaId, parsed.base64, parsed.mimeType]
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
          const b64 = bytesToBase64(new Uint8Array(bytes));
          await db.execute(
            'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
            [mediaId, b64, mimeType]
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
            const b64 = bytesToBase64(new Uint8Array(bytes));
            await db.execute(
              'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
              [mediaId, b64, mimeType]
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
            const b64 = bytesToBase64(new Uint8Array(bytes));
            await db.execute(
              'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
              [mediaId, b64, mimeType]
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
          const b64 = bytesToBase64(new Uint8Array(bytes));
          await db.execute(
            'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
            [mediaId, b64, mimeType]
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
          const b64 = bytesToBase64(new Uint8Array(bytes));
          await db.execute(
            'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
            [iconMediaId, b64, mimeType]
          );
          await db.execute('UPDATE custom_backgrounds SET icon = ? WHERE id = ?', [iconMediaId, bg.id]);
        } catch {}
      }
    }
  } catch (e) {
    console.warn('Media migration skipped:', e);
  }
}
