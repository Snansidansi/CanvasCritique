import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { store } from '../state/store.svelte';
import { t } from './i18n';
import { backupDatabase, replaceDatabase, getDb, getSettings, saveSettings, getCanvasDataDir } from '../db';
import { defaultSettings } from '../state/defaults';
import { appLocalDataDir, appDataDir, join } from '@tauri-apps/api/path';
import { readFile, remove, exists, mkdir, readDir, stat } from '@tauri-apps/plugin-fs';

const SYNC_META_FILE = 'canvascritique_sync_meta.json';
const BACKUP_DB_FILE = 'canvascritique_backup.db';
const REMOTE_DB_FILE_GZ = 'canvascritique_backup.db.gz';
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

async function getDatabaseChangeCounter(customPath?: string): Promise<number> {
  try {
    let dbPath = customPath;
    if (!dbPath) {
      const appData = await appDataDir();
      dbPath = await join(appData, 'canvascritique.db');
    }
    if (!(await exists(dbPath))) {
      return 0;
    }
    const bytes = await readFile(dbPath);
    if (bytes.length < 28) return 0;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getUint32(24, false);
  } catch (err) {
    console.error('Failed to get SQLite change counter:', err);
    return 0;
  }
}

async function compressGzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data as any).body!.pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function decompressGzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data as any).body!.pipeThrough(new DecompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
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

    const localChangeCounter = await getDatabaseChangeCounter();
    const lastSyncedChangeCounter = settings.lastSyncedChangeCounter || 0;
    const hasLocalChanges = localChangeCounter !== lastSyncedChangeCounter;

    let dbTransferred = false;

    // 2. If remote DB is newer (or forced download), download and replace local DB
    const shouldDownload = (effectiveMode === 'download' || effectiveMode === 'bidirectional') && (forceMode === 'download' || remoteTimestamp > localTimestamp);
    if (shouldDownload) {
      console.log('Remote DB is newer (or forced download). Downloading...');
      
      const appData = await appDataDir();
      const localBackupPath = await join(appData, BACKUP_DB_FILE);
      
      let dbBytes: Uint8Array;
      if (await client.exists('/' + REMOTE_DB_FILE_GZ)) {
        console.log('Downloading compressed remote DB...');
        const compressed = await client.getFileContents('/' + REMOTE_DB_FILE_GZ, { format: 'binary' }) as Uint8Array;
        dbBytes = await decompressGzip(compressed);
      } else {
        console.log('Downloading uncompressed remote DB (fallback)...');
        dbBytes = await client.getFileContents('/' + BACKUP_DB_FILE, { format: 'binary' }) as Uint8Array;
      }

      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(localBackupPath, dbBytes);

      const downloadedDbChangeCounter = await getDatabaseChangeCounter(localBackupPath);

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
        lastSyncedTimestamp: remoteTimestamp >= localTimestamp ? remoteTimestamp : localTimestamp,
        lastSyncedChangeCounter: downloadedDbChangeCounter
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

      // Canvas Data Sync - download missing canvas data referenced by the new DB
      try {
        await syncCanvasData(client, effectiveMode);
      } catch (canvasErr) {
        console.error('Failed to sync canvas data after DB replace:', canvasErr);
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

    // 3.5. Canvas Data Sync
    try {
      await syncCanvasData(client, effectiveMode);
    } catch (canvasErr) {
      console.error('Failed to sync canvas data:', canvasErr);
    }

    // 4. Upload Local DB to WebDAV
    const shouldUpload = (effectiveMode === 'bidirectional' || effectiveMode === 'upload') && (forceMode === 'upload' || hasLocalChanges);
    if (shouldUpload) {
      console.log('Uploading local DB to WebDAV...');
      const appData = await appDataDir();
      const localBackupPath = await join(appData, BACKUP_DB_FILE);
      
      await backupDatabase(localBackupPath);
      const dbBytes = await readFile(localBackupPath);
      const compressedBytes = await compressGzip(dbBytes);
      await client.putFileContents('/' + REMOTE_DB_FILE_GZ, compressedBytes, { overwrite: true });
      await remove(localBackupPath);

      // Clean up old uncompressed DB file if it exists on server
      try {
        if (await client.exists('/' + BACKUP_DB_FILE)) {
          await client.deleteFile('/' + BACKUP_DB_FILE);
        }
      } catch (err) {
        console.warn('Failed to delete old uncompressed remote DB file:', err);
      }

      // Update metadata
      const newTimestamp = new Date().toISOString();
      await client.putFileContents('/' + SYNC_META_FILE, JSON.stringify({ lastSyncedTimestamp: newTimestamp }), { overwrite: true });

      // Save locally
      store.settings.lastSyncedTimestamp = newTimestamp;
      store.settings.lastSyncedChangeCounter = localChangeCounter;
      await store.saveSettings();
      dbTransferred = true;
    }

    if (dbTransferred) {
      store.showNotification(t('settings.data.notifications.syncSuccess') || 'Sync completed.', 'success');
    } else {
      store.showNotification(t('settings.data.notifications.syncNoChanges') || 'Sync completed. No changes detected.', 'success');
    }

  } catch (err) {
    console.error('WebDAV Sync Error:', err);
    store.showNotification(t('settings.data.notifications.syncError') || 'Sync failed', 'error');
  } finally {
    store.isSyncing = false;
  }
}

async function syncCanvasData(client: WebDAVClient, syncMode: 'bidirectional' | 'download' | 'upload') {
  const db = getDb();
  const localCanvasDir = await getCanvasDataDir();
  const REMOTE_CANVAS_DIR = '/canvas_data';

  // Ensure remote canvas_data dir exists
  if (!(await client.exists(REMOTE_CANVAS_DIR))) {
    await client.createDirectory(REMOTE_CANVAS_DIR);
  }

  // Get all task IDs registered in the local SQLite database
  const dbRows = await db.select('SELECT id FROM tasks') as Array<{ id: string }>;
  const dbIds = new Set(dbRows.map(r => r.id));

  // Get local canvas_data list from the filesystem
  let localEntries: any[] = [];
  try {
    if (await exists(localCanvasDir)) {
      localEntries = await readDir(localCanvasDir);
    }
  } catch (err) {
    console.error('Failed to read local canvas_data directory:', err);
  }

  const localFiles = new Map<string, { name: string; mtime: Date }>();
  for (const entry of localEntries) {
    if (entry.isFile && entry.name && entry.name.endsWith('.json')) {
      const taskId = entry.name.substring(0, entry.name.length - 5);
      try {
        const info = await stat(await join(localCanvasDir, entry.name));
        const mtime = info.mtime ? new Date(info.mtime) : new Date();
        localFiles.set(taskId, { name: entry.name, mtime });
      } catch (_) {
        localFiles.set(taskId, { name: entry.name, mtime: new Date() });
      }
    }
  }

  // Get remote canvas_data list
  const remoteMap = new Map<string, { basename: string; lastmod: Date }>();
  try {
    const remoteItems = await client.getDirectoryContents(REMOTE_CANVAS_DIR);
    for (const item of remoteItems) {
      if (item.type === 'file' && item.basename.endsWith('.json.gz')) {
        const taskId = item.basename.substring(0, item.basename.length - 8);
        remoteMap.set(taskId, { basename: item.basename, lastmod: new Date(item.lastmod) });
      }
    }
  } catch (err) {
    console.warn('Failed to retrieve remote canvas_data list:', err);
  }

  // Sync active task files
  for (const id of dbIds) {
    const localInfo = localFiles.get(id);
    const remoteInfo = remoteMap.get(id);

    const hasLocal = !!localInfo;
    const hasRemote = !!remoteInfo;

    if (hasLocal && !hasRemote) {
      if (syncMode === 'bidirectional' || syncMode === 'upload') {
        console.log(`Uploading canvas ${id}...`);
        try {
          const filePath = await join(localCanvasDir, `${id}.json`);
          const rawBytes = await readFile(filePath);
          const compressed = await compressGzip(rawBytes);
          await client.putFileContents(`${REMOTE_CANVAS_DIR}/${id}.json.gz`, compressed, { overwrite: true });
        } catch (err) {
          console.error(`Failed to upload canvas ${id}:`, err);
        }
      }
    } else if (!hasLocal && hasRemote) {
      if (syncMode === 'bidirectional' || syncMode === 'download') {
        console.log(`Downloading canvas ${id}...`);
        try {
          const compressed = await client.getFileContents(`${REMOTE_CANVAS_DIR}/${id}.json.gz`, { format: 'binary' }) as Uint8Array;
          const decompressed = await decompressGzip(compressed);
          const filePath = await join(localCanvasDir, `${id}.json`);
          const { writeFile } = await import('@tauri-apps/plugin-fs');
          await writeFile(filePath, decompressed);
        } catch (err) {
          console.error(`Failed to download canvas ${id}:`, err);
        }
      }
    } else if (hasLocal && hasRemote) {
      const localTime = localInfo.mtime.getTime();
      const remoteTime = remoteInfo.lastmod.getTime();

      if (remoteTime > localTime + 1000) {
        if (syncMode === 'bidirectional' || syncMode === 'download') {
          console.log(`Downloading newer canvas ${id}...`);
          try {
            const compressed = await client.getFileContents(`${REMOTE_CANVAS_DIR}/${id}.json.gz`, { format: 'binary' }) as Uint8Array;
            const decompressed = await decompressGzip(compressed);
            const filePath = await join(localCanvasDir, `${id}.json`);
            const { writeFile } = await import('@tauri-apps/plugin-fs');
            await writeFile(filePath, decompressed);
          } catch (err) {
            console.error(`Failed to download canvas ${id}:`, err);
          }
        }
      } else if (localTime > remoteTime + 1000) {
        if (syncMode === 'bidirectional' || syncMode === 'upload') {
          console.log(`Uploading newer canvas ${id}...`);
          try {
            const filePath = await join(localCanvasDir, `${id}.json`);
            const rawBytes = await readFile(filePath);
            const compressed = await compressGzip(rawBytes);
            await client.putFileContents(`${REMOTE_CANVAS_DIR}/${id}.json.gz`, compressed, { overwrite: true });
          } catch (err) {
            console.error(`Failed to upload canvas ${id}:`, err);
          }
        }
      }
    }
  }

  // Cleanup local orphaned files
  for (const [id, localInfo] of localFiles.entries()) {
    if (!dbIds.has(id)) {
      console.log(`Deleting local orphaned canvas/editor data ${localInfo.name}...`);
      try {
        const filePath = await join(localCanvasDir, localInfo.name);
        await remove(filePath);
      } catch (err) {
        console.error(`Failed to delete local orphaned canvas ${localInfo.name}:`, err);
      }
    }
  }

  // Cleanup remote orphaned files
  if (syncMode === 'bidirectional' || syncMode === 'upload') {
    for (const [id, remoteInfo] of remoteMap.entries()) {
      if (!dbIds.has(id)) {
        console.log(`Deleting remote orphaned canvas/editor data ${remoteInfo.basename}...`);
        try {
          await client.deleteFile(`${REMOTE_CANVAS_DIR}/${remoteInfo.basename}`);
        } catch (err) {
          console.error(`Failed to delete remote orphaned canvas ${remoteInfo.basename}:`, err);
        }
      }
    }
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
