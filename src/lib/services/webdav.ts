import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { store } from '../state/store.svelte';
import { t } from './i18n';
import { backupDatabase, replaceDatabase, getDb, getSettings, saveSettings } from '../db';
import { defaultSettings } from '../state/defaults';
import { appLocalDataDir, appDataDir, join } from '@tauri-apps/api/path';
import { readFile, remove, exists, mkdir, readDir, stat } from '@tauri-apps/plugin-fs';

const SYNC_META_FILE = 'canvascritique_sync_meta.json';
const BACKUP_DB_FILE = 'canvascritique_backup.db';
const REMOTE_MEDIA_DIR = '/media';

class CustomWebDAVClient {
  private url: string;
  private authHeader: string;

  constructor(url: string, username?: string, password?: string) {
    this.url = url.endsWith('/') ? url.slice(0, -1) : url;
    if (username || password) {
      const credentialsStr = (username || '') + ':' + (password || '');
      const base64Credentials = btoa(unescape(encodeURIComponent(credentialsStr)));
      this.authHeader = 'Basic ' + base64Credentials;
    } else {
      this.authHeader = '';
    }
  }

  private getUrl(path: string): string {
    const p = path.startsWith('/') ? path : '/' + path;
    return this.url + p;
  }

  async exists(path: string): Promise<boolean> {
    const targetUrl = this.getUrl(path);
    console.log(`[Custom WebDAV Client] Checking exists: ${targetUrl}`);
    try {
      const response = await tauriFetch(targetUrl, {
        method: 'PROPFIND',
        headers: {
          ...(this.authHeader ? { 'Authorization': this.authHeader } : {}),
          'Depth': '0'
        }
      });
      console.log(`[Custom WebDAV Client] exists response: ${response.status}`);
      return response.status >= 200 && response.status < 300;
    } catch (err) {
      console.error(`[Custom WebDAV Client] exists check failed:`, err);
      return false;
    }
  }

  async createDirectory(path: string): Promise<void> {
    const targetUrl = this.getUrl(path);
    console.log(`[Custom WebDAV Client] Creating directory: ${targetUrl}`);
    const response = await tauriFetch(targetUrl, {
      method: 'MKCOL',
      headers: {
        ...(this.authHeader ? { 'Authorization': this.authHeader } : {})
      }
    });
    console.log(`[Custom WebDAV Client] createDirectory response: ${response.status}`);
    if (response.status !== 201 && response.status !== 405) { // 405 means already exists
      throw new Error(`Failed to create directory: ${response.status} ${response.statusText}`);
    }
  }

  async getFileContents(path: string, options?: { format?: 'text' | 'binary' }): Promise<string | Uint8Array> {
    const targetUrl = this.getUrl(path);
    console.log(`[Custom WebDAV Client] Getting file: ${targetUrl}, format: ${options?.format || 'binary'}`);
    const response = await tauriFetch(targetUrl, {
      method: 'GET',
      headers: {
        ...(this.authHeader ? { 'Authorization': this.authHeader } : {})
      }
    });
    console.log(`[Custom WebDAV Client] getFileContents response: ${response.status}`);
    if (response.status !== 200) {
      throw new Error(`Failed to get file: ${response.status} ${response.statusText}`);
    }
    if (options?.format === 'text') {
      return await response.text();
    } else {
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    }
  }

  async putFileContents(path: string, content: string | Uint8Array, options?: { overwrite?: boolean }): Promise<void> {
    const targetUrl = this.getUrl(path);
    console.log(`[Custom WebDAV Client] Putting file: ${targetUrl}`);
    const response = await tauriFetch(targetUrl, {
      method: 'PUT',
      headers: {
        ...(this.authHeader ? { 'Authorization': this.authHeader } : {}),
        'Content-Type': 'application/octet-stream'
      },
      body: content as any
    });
    console.log(`[Custom WebDAV Client] putFileContents response: ${response.status}`);
    if (response.status !== 200 && response.status !== 201 && response.status !== 204) {
      throw new Error(`Failed to put file: ${response.status} ${response.statusText}`);
    }
  }

  async deleteFile(path: string): Promise<void> {
    const targetUrl = this.getUrl(path);
    console.log(`[Custom WebDAV Client] Deleting file: ${targetUrl}`);
    const response = await tauriFetch(targetUrl, {
      method: 'DELETE',
      headers: {
        ...(this.authHeader ? { 'Authorization': this.authHeader } : {})
      }
    });
    console.log(`[Custom WebDAV Client] deleteFile response: ${response.status}`);
    if (response.status !== 200 && response.status !== 204 && response.status !== 404) {
      throw new Error(`Failed to delete file: ${response.status} ${response.statusText}`);
    }
  }


  async getDirectoryContents(path: string): Promise<Array<{ basename: string; lastmod: string; type: 'file' | 'directory' }>> {
    const targetUrl = this.getUrl(path);
    console.log(`[Custom WebDAV Client] Getting directory contents: ${targetUrl}`);
    const response = await tauriFetch(targetUrl, {
      method: 'PROPFIND',
      headers: {
        ...(this.authHeader ? { 'Authorization': this.authHeader } : {}),
        'Depth': '1'
      }
    });
    console.log(`[Custom WebDAV Client] getDirectoryContents response: ${response.status}`);
    if (response.status !== 207) {
      throw new Error(`Failed to get directory contents: ${response.status} ${response.statusText}`);
    }
    const xmlText = await response.text();
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const responses = xmlDoc.getElementsByTagNameNS('*', 'response');
    const items: Array<{ basename: string; lastmod: string; type: 'file' | 'directory' }> = [];
    
    const targetUrlObj = new URL(targetUrl.startsWith('http') ? targetUrl : 'http://localhost' + targetUrl);
    const targetPath = decodeURIComponent(targetUrlObj.pathname).replace(/\/$/, '');
    
    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];
      const hrefEl = resp.getElementsByTagNameNS('*', 'href')[0];
      if (!hrefEl) continue;
      
      const href = decodeURIComponent(hrefEl.textContent || '');
      
      let hrefPath = href;
      if (href.startsWith('http://') || href.startsWith('https://')) {
        try {
          hrefPath = new URL(href).pathname;
        } catch {}
      }
      hrefPath = hrefPath.replace(/\/$/, '');
      
      if (hrefPath === targetPath) {
        continue;
      }
      
      const parts = hrefPath.split('/').filter(Boolean);
      const basename = parts[parts.length - 1] || '';
      
      const resourceTypeEl = resp.getElementsByTagNameNS('*', 'resourcetype')[0];
      const isDir = resourceTypeEl && resourceTypeEl.getElementsByTagNameNS('*', 'collection').length > 0;
      
      const lastModEl = resp.getElementsByTagNameNS('*', 'getlastmodified')[0];
      const lastmod = lastModEl ? lastModEl.textContent || '' : '';
      
      items.push({
        basename,
        lastmod,
        type: isDir ? 'directory' : 'file'
      });
    }
    
    return items;
  }
}

export type WebDAVClient = CustomWebDAVClient;

export function getWebDavClient(): WebDAVClient | null {
  const settings = store.settings;
  if (!settings.webdavEnabled || !settings.webdavUrl) {
    return null;
  }

  return new CustomWebDAVClient(
    settings.webdavUrl,
    settings.webdavUsername,
    settings.webdavPassword
  );
}

export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  const client = getWebDavClient();
  if (!client) throw new Error('WebDAV is not configured');

  try {
    const isConnected = await client.exists('/');
    return { success: isConnected };
  } catch (err: any) {
    console.error('WebDAV connection failed:', err);
    return { success: false, error: err?.message || String(err) };
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

    const effectiveMode = forceMode || settings.webdavSyncMode || 'bidirectional';

    // 2. If remote DB is newer (or forced download), download and replace local DB
    const shouldDownload = (effectiveMode === 'download' || effectiveMode === 'bidirectional') && (forceMode === 'download' || remoteTimestamp > localTimestamp);
    if (shouldDownload) {
      console.log('Remote DB is newer (or forced download). Downloading...');
      
      const appData = await appDataDir();
      const localBackupPath = await join(appData, BACKUP_DB_FILE);
      
      const dbContent = await client.getFileContents('/' + BACKUP_DB_FILE, { format: 'binary' }) as Uint8Array;
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(localBackupPath, dbContent);

      // Keep local client-specific WebDAV settings to restore after replace
      const localWebDavSettings = {
        webdavEnabled: store.settings.webdavEnabled,
        webdavUrl: store.settings.webdavUrl,
        webdavUsername: store.settings.webdavUsername,
        webdavPassword: store.settings.webdavPassword,
        webdavAutoSync: store.settings.webdavAutoSync,
        webdavSyncIntervalMinutes: store.settings.webdavSyncIntervalMinutes,
        webdavSyncOnStartup: store.settings.webdavSyncOnStartup,
        webdavSyncOnShutdown: store.settings.webdavSyncOnShutdown,
        webdavSyncMode: store.settings.webdavSyncMode,
        lastSyncedTimestamp: remoteTimestamp >= localTimestamp ? remoteTimestamp : localTimestamp
      };

      // Replace active DB
      await replaceDatabase(localBackupPath);
      
      // Clean up temp file
      await remove(localBackupPath);

      // Load downloaded settings, merge local WebDAV settings, and save to DB
      const db = getDb();
      const downloadedSettings = await getSettings(db);
      const mergedSettings = {
        ...(downloadedSettings || defaultSettings),
        ...localWebDavSettings
      };
      await saveSettings(db, mergedSettings);
      store.settings = mergedSettings;

      // Media Sync - download missing media referenced by the new DB
      try {
        await syncMedia(client, effectiveMode);
      } catch (mediaErr) {
        console.error('Failed to sync media after DB replace:', mediaErr);
      }

      // Trigger full app reload because DB changed fundamentally
      store.showNotification(t('settings.data.notifications.syncDbDownloaded') || 'Database synced. Reloading...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 500);
      return; // Stop here, reload will handle the rest
    }

    // 3. Media Sync
    try {
      await syncMedia(client, effectiveMode);
    } catch (mediaErr) {
      console.error('Failed to sync media:', mediaErr);
    }

    // 4. Upload Local DB to WebDAV
    if (effectiveMode === 'bidirectional' || effectiveMode === 'upload') {
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
    } else {
      // In download-only mode where no new remote data was available, we just finish
      store.showNotification(t('settings.data.notifications.syncSuccess') || 'Sync completed.', 'success');
    }

  } catch (err) {
    console.error('WebDAV Sync Error:', err);
    store.showNotification(t('settings.data.notifications.syncError') || 'Sync failed', 'error');
  } finally {
    store.isSyncing = false;
  }
}

async function syncMedia(client: WebDAVClient, syncMode: 'bidirectional' | 'download' | 'upload') {
  const db = getDb();
  const localAppDir = await appLocalDataDir();
  const mediaDir = await join(localAppDir, 'media');

  // Ensure remote media dir exists
  if (!(await client.exists(REMOTE_MEDIA_DIR))) {
    await client.createDirectory(REMOTE_MEDIA_DIR);
  }

  // Get all media IDs registered in the local SQLite database
  const dbRows = await db.select('SELECT id FROM media') as Array<{ id: string }>;
  const dbIds = new Set(dbRows.map(r => r.id));

  // Get local media list from the filesystem
  let localEntries: any[] = [];
  try {
    if (await exists(mediaDir)) {
      localEntries = await readDir(mediaDir);
    }
  } catch (err) {
    console.error('Failed to read local media directory:', err);
  }

  const localFiles = new Set<string>();
  for (const entry of localEntries) {
    if (entry.isFile && entry.name) {
      localFiles.add(entry.name);
    }
  }

  // Get remote media list (only if upload is needed to determine what to upload)
  const remoteMap = new Map<string, Date>();
  if (syncMode === 'bidirectional' || syncMode === 'upload') {
    try {
      const remoteItems = await client.getDirectoryContents(REMOTE_MEDIA_DIR);
      for (const item of remoteItems) {
        if (item.type === 'file') {
          remoteMap.set(item.basename, new Date(item.lastmod));
        }
      }
    } catch (err) {
      console.warn('Failed to retrieve remote media list:', err);
    }
  }

  // Upload missing/newer local files
  if (syncMode === 'bidirectional' || syncMode === 'upload') {
    for (const id of dbIds) {
      if (localFiles.has(id)) {
        const remoteDate = remoteMap.get(id);
        if (!remoteDate) {
          console.log(`Uploading media ${id}...`);
          const filePath = await join(mediaDir, id);
          if (await exists(filePath)) {
            const bytes = await readFile(filePath);
            await client.putFileContents(`${REMOTE_MEDIA_DIR}/${id}`, bytes, { overwrite: true });
          }
        }
      }
    }
  }

  // Download missing remote files
  if (syncMode === 'bidirectional' || syncMode === 'download') {
    for (const id of dbIds) {
      if (!localFiles.has(id)) {
        console.log(`Downloading media ${id}...`);
        try {
          const bytes = await client.getFileContents(`${REMOTE_MEDIA_DIR}/${id}`, { format: 'binary' }) as Uint8Array;
          const filePath = await join(mediaDir, id);
          const { writeFile } = await import('@tauri-apps/plugin-fs');
          await writeFile(filePath, bytes);
        } catch (err) {
          console.error(`Failed to download media ${id} from WebDAV:`, err);
          // Create a local placeholder (0-byte file) to prevent repeated download attempts and sync failures
          try {
            const filePath = await join(mediaDir, id);
            const { writeFile } = await import('@tauri-apps/plugin-fs');
            await writeFile(filePath, new Uint8Array(0));
            console.log(`Created empty local placeholder file for missing remote media ${id}`);
          } catch (writeErr) {
            console.error(`Failed to write local placeholder for ${id}:`, writeErr);
          }
        }
      }
    }
  }

  // Cleanup local files that are not registered in the SQLite database
  for (const entry of localEntries) {
    if (entry.isFile && entry.name && !dbIds.has(entry.name)) {
      console.log(`Deleting local orphaned media ${entry.name}...`);
      try {
        const filePath = await join(mediaDir, entry.name);
        await remove(filePath);
      } catch (err) {
        console.error(`Failed to delete local orphaned media ${entry.name}:`, err);
      }
    }
  }

  // Cleanup remote files that are not registered in the SQLite database
  if (syncMode === 'bidirectional' || syncMode === 'upload') {
    for (const [basename] of remoteMap.entries()) {
      if (!dbIds.has(basename)) {
        console.log(`Deleting remote orphaned media ${basename}...`);
        try {
          await client.deleteFile(`${REMOTE_MEDIA_DIR}/${basename}`);
        } catch (err) {
          console.error(`Failed to delete remote orphaned media ${basename}:`, err);
        }
      }
    }
  }
}
