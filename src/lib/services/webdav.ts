import { createClient, WebDAVClient } from 'webdav';
import { store } from '../state/store.svelte';
import { t } from './i18n';
import { backupDatabase, replaceDatabase, getDb } from '../db';
import { appLocalDataDir, appDataDir, join } from '@tauri-apps/api/path';
import { readFile, remove, exists, mkdir } from '@tauri-apps/plugin-fs';

const SYNC_META_FILE = 'canvascritique_sync_meta.json';
const BACKUP_DB_FILE = 'canvascritique_backup.db';
const REMOTE_MEDIA_DIR = '/media';

export function getWebDavClient(): WebDAVClient | null {
  const settings = store.settings;
  if (!settings.webdavEnabled || !settings.webdavUrl) {
    return null;
  }

  return createClient(settings.webdavUrl, {
    username: settings.webdavUsername,
    password: settings.webdavPassword,
  });
}

export async function testConnection(): Promise<boolean> {
  const client = getWebDavClient();
  if (!client) throw new Error('WebDAV is not configured');

  try {
    const isConnected = await client.exists('/');
    return isConnected;
  } catch (err) {
    console.error('WebDAV connection failed:', err);
    return false;
  }
}

export async function syncWebDav(forceMode?: 'download' | 'upload'): Promise<void> {
  const client = getWebDavClient();
  const settings = store.settings;

  if (!client || !settings.webdavEnabled) return;
  if (store.isSyncing) return; // Prevent concurrent syncs

  store.isSyncing = true;
  try {
    store.showNotification(t('settings.data.notifications.syncStarted') || 'Syncing...', 'info');

    // 1. Check sync metadata
    let remoteMeta: { lastSyncedTimestamp: string } | null = null;
    try {
      if (await client.exists('/' + SYNC_META_FILE)) {
        const metaContent = await client.getFileContents('/' + SYNC_META_FILE, { format: 'text' }) as string;
        remoteMeta = JSON.parse(metaContent);
      }
    } catch (err) {
      console.warn('Could not read remote metadata, it might not exist yet.', err);
    }

    const localTimestamp = settings.lastSyncedTimestamp || '0';
    const remoteTimestamp = remoteMeta?.lastSyncedTimestamp || '0';

    // 2. If remote DB is newer (or forced download), download and replace local DB
    if (forceMode === 'download' || (forceMode !== 'upload' && remoteTimestamp > localTimestamp)) {
      console.log('Remote DB is newer (or forced download). Downloading...');
      
      const appData = await appDataDir();
      const localBackupPath = await join(appData, BACKUP_DB_FILE);
      
      const dbContent = await client.getFileContents('/' + BACKUP_DB_FILE, { format: 'binary' }) as Uint8Array;
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(localBackupPath, dbContent);

      // Replace active DB
      await replaceDatabase(localBackupPath);
      
      // Clean up temp file
      await remove(localBackupPath);

      // Media Sync - download missing media referenced by the new DB
      try {
        await syncMedia(client);
      } catch (mediaErr) {
        console.error('Failed to sync media after DB replace:', mediaErr);
      }

      // Update local timestamp so we don't redownload immediately
      if (remoteTimestamp >= localTimestamp) {
        store.settings.lastSyncedTimestamp = remoteTimestamp;
        await store.saveSettings();
      }

      // Trigger full app reload because DB changed fundamentally
      store.showNotification(t('settings.data.notifications.syncDbDownloaded') || 'Database synced. Reloading...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 500);
      return; // Stop here, reload will handle the rest
    }

    // 3. Media Sync (2-way)
    try {
      await syncMedia(client);
    } catch (mediaErr) {
      console.error('Failed to sync media:', mediaErr);
    }

    // 4. Upload Local DB to WebDAV
    console.log('Uploading local DB to WebDAV...');
    const appData = await appDataDir();
    const localBackupPath = await join(appData, BACKUP_DB_FILE);
    
    await backupDatabase(localBackupPath);
    const dbBytes = await readFile(localBackupPath);
    await client.putFileContents('/' + BACKUP_DB_FILE, dbBytes, { overwrite: true });
    await remove(localBackupPath);

    // Update metadata
    const newTimestamp = new Date().toISOString();
    await client.putFileContents('/' + SYNC_META_FILE, JSON.stringify({ lastSyncedTimestamp: newTimestamp }), { overwrite: true });

    // Save locally
    store.settings.lastSyncedTimestamp = newTimestamp;
    await store.saveSettings();
    store.showNotification(t('settings.data.notifications.syncSuccess') || 'Sync completed.', 'success');

  } catch (err) {
    console.error('WebDAV Sync Error:', err);
    store.showNotification(t('settings.data.notifications.syncError') || 'Sync failed', 'error');
  } finally {
    store.isSyncing = false;
  }
}

async function syncMedia(client: WebDAVClient) {
  const db = getDb();
  const localAppDir = await appLocalDataDir();
  const mediaDir = await join(localAppDir, 'media');

  // Ensure remote media dir exists
  if (!(await client.exists(REMOTE_MEDIA_DIR))) {
    await client.createDirectory(REMOTE_MEDIA_DIR);
  }

  // Get remote media list
  const remoteItems = await client.getDirectoryContents(REMOTE_MEDIA_DIR) as Array<{ basename: string, lastmod: string }>;
  const remoteMap = new Map<string, Date>();
  for (const item of remoteItems) {
    remoteMap.set(item.basename, new Date(item.lastmod));
  }

  // Get local media list
  const localRows: any[] = await db.select('SELECT id, updated_at FROM media');
  const localMap = new Map<string, Date>();
  for (const row of localRows) {
    let dateStr = row.updated_at;
    if (!dateStr.includes('T')) {
      dateStr = dateStr.replace(' ', 'T') + 'Z';
    }
    localMap.set(row.id, new Date(dateStr));
  }

  // Upload new/newer local files
  for (const [id, localDate] of localMap.entries()) {
    const remoteDate = remoteMap.get(id);
    if (!remoteDate || localDate > remoteDate) {
      console.log(`Uploading media ${id}...`);
      const filePath = await join(mediaDir, id);
      if (await exists(filePath)) {
        const bytes = await readFile(filePath);
        await client.putFileContents(`${REMOTE_MEDIA_DIR}/${id}`, bytes, { overwrite: true });
      }
    }
  }

  // Download new/newer remote files
  for (const [id, remoteDate] of remoteMap.entries()) {
    const localDate = localMap.get(id);
    if (!localDate || remoteDate > localDate) {
      console.log(`Downloading media ${id}...`);
      const bytes = await client.getFileContents(`${REMOTE_MEDIA_DIR}/${id}`, { format: 'binary' }) as Uint8Array;
      const filePath = await join(mediaDir, id);
      
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(filePath, bytes);

      if (!localDate) {
        const ext = id.split('.').pop()?.toLowerCase() || 'bin';
        const mimeMap: Record<string, string> = {
          'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
          'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
          'mp3': 'audio/mpeg', 'mp4': 'video/mp4', 'pdf': 'application/pdf'
        };
        const mimeType = mimeMap[ext] || 'application/octet-stream';

        await db.execute(
          'INSERT OR IGNORE INTO media (id, data, mime_type) VALUES (?, ?, ?)',
          [id, `media/${id}`, mimeType]
        );
      }
    }
  }
}
