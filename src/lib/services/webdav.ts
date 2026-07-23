import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { store } from '../state/store.svelte';
import { t } from './i18n';
import { backupDatabase, replaceDatabase, getDb, getSettings, saveSettings, getCanvasDataDir, loadTaskSolutionFromDisk, loadAllCanvasMetadata, updateLocalCanvasMetadata, syncAttemptsTableWithFiles, loadAttemptFromDisk } from '../db';
import { defaultSettings } from '../state/defaults';
import { appLocalDataDir, appDataDir, join } from '@tauri-apps/api/path';
import { readFile, remove, exists, mkdir, readDir, stat } from '@tauri-apps/plugin-fs';
import pkg from '../../../package.json';

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

  async stat(path: string): Promise<{ lastmod: string } | null> {
    const targetUrl = this.getUrl(path);
    console.log(`[Custom WebDAV Client] Stat: ${targetUrl}`);
    try {
      const response = await tauriFetch(targetUrl, {
        method: 'PROPFIND',
        headers: {
          ...(this.authHeader ? { 'Authorization': this.authHeader } : {}),
          'Depth': '0'
        }
      });
      if (response.status !== 207) return null;
      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const lastModEl = xmlDoc.getElementsByTagNameNS('*', 'getlastmodified')[0];
      const lastmod = lastModEl ? lastModEl.textContent || '' : '';
      return { lastmod };
    } catch (err) {
      console.error(`[Custom WebDAV Client] stat failed:`, err);
      return null;
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

async function computeSha256(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as any);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function saveLocalSyncState(timestamp: string, dbHash: string): Promise<void> {
  try {
    const appData = await appDataDir();
    const path = await join(appData, 'canvascritique_sync_state.json');
    const state = { lastSyncedTimestamp: timestamp, lastSyncedDbHash: dbHash };
    const bytes = new TextEncoder().encode(JSON.stringify(state, null, 2));
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, bytes);
  } catch (err) {
    console.error('Failed to save local sync state file:', err);
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  const maxLength = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLength; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export async function syncWebDav(forceMode?: 'download' | 'upload', skipCleanup = false): Promise<void> {
  const client = getWebDavClient();
  const settings = store.settings;

  if (!client || !settings.webdavEnabled) return;
  if (store.isSyncing) return; // Prevent concurrent syncs

  store.isSyncing = true;
  store.showNotification(t('settings.data.notifications.syncStarted') || 'Syncing...', 'info');

  try {
    try {
      await store.persistAllCanvasStates();
    } catch (e) {
      console.error('Failed to persist canvas states before WebDAV sync:', e);
    }

    // Perform cleanup for forced modes
    if (forceMode === 'download') {
      console.log('Forced download requested: clearing all local media and canvas data first...');
      try {
        const localCanvasDir = await getCanvasDataDir();
        if (await exists(localCanvasDir)) {
          const entries = await readDir(localCanvasDir);
          for (const entry of entries) {
            await remove(await join(localCanvasDir, entry.name));
          }
        }
        const localAppDir = await appLocalDataDir();
        const mediaDir = await join(localAppDir, 'media');
        if (await exists(mediaDir)) {
          const entries = await readDir(mediaDir);
          for (const entry of entries) {
            await remove(await join(mediaDir, entry.name));
          }
        }
      } catch (err) {
        console.error('Failed to clear local directories during forced download:', err);
      }
    } else if (forceMode === 'upload') {
      console.log('Forced upload requested: cleaning all remote files on WebDAV first...');
      try {
        if (await client.exists('/' + REMOTE_DB_FILE_GZ)) await client.deleteFile('/' + REMOTE_DB_FILE_GZ);
        if (await client.exists('/' + BACKUP_DB_FILE)) await client.deleteFile('/' + BACKUP_DB_FILE);
        if (await client.exists('/' + SYNC_META_FILE)) await client.deleteFile('/' + SYNC_META_FILE);
        if (await client.exists('/canvas_data')) await client.deleteFile('/canvas_data');
        if (await client.exists('/media')) await client.deleteFile('/media');
      } catch (err) {
        console.error('Failed to clear remote directories during forced upload:', err);
      }
    }

    if (!skipCleanup && forceMode !== 'download') {
      try {
        await store.cleanOrphanedMedia();
      } catch (e) {
        console.error('Media cleanup before WebDAV sync failed:', e);
      }
    }

    // 1. Check sync metadata
    let remoteMeta: { lastSyncedTimestamp: string; dbHash?: string; version?: string } | null = null;
    try {
      if (await client.exists('/' + SYNC_META_FILE)) {
        const metaContent = await client.getFileContents('/' + SYNC_META_FILE, { format: 'text' }) as string;
        remoteMeta = JSON.parse(metaContent);
      }
    } catch (err) {
      console.warn('Could not read remote metadata, it might not exist yet.', err);
    }

    const localVersion = pkg.version;
    const remoteVersion = remoteMeta?.version || '0.0.0';
    const versionComparison = compareVersions(localVersion, remoteVersion);
    const localVersionIsNewer = versionComparison > 0;

    if (versionComparison < 0) {
      console.warn(`Sync denied: Local version ${localVersion} is older than remote version ${remoteVersion}`);
      store.confirm(
        t('settings.data.notifications.syncVersionMismatchTitle') || 'Versionskonflikt',
        t('settings.data.notifications.syncVersionMismatchMsg', { local: localVersion, remote: remoteVersion }) || `Die Synchronisation wurde verweigert. Die Version deiner App (${localVersion}) ist älter als die Version auf dem WebDAV-Server (${remoteVersion}). Bitte aktualisiere deine App, um die Synchronisation fortzusetzen.`,
        () => {},
        null,
        true
      );
      return;
    }

    const localTimestamp = settings.lastSyncedTimestamp || '0';
    const remoteTimestamp = remoteMeta?.lastSyncedTimestamp || '0';
    const remoteDbHash = remoteMeta?.dbHash;

    const effectiveMode = forceMode || settings.webdavSyncMode || 'bidirectional';

    // Get SHA-256 hash of the local database by backing it up first
    const appData = await appDataDir();
    const localBackupPath = await join(appData, BACKUP_DB_FILE);
    await backupDatabase(localBackupPath);
    const dbBytes = await readFile(localBackupPath);
    const localDbHash = await computeSha256(dbBytes);

    const hasDbChanges = remoteDbHash !== localDbHash;
    const isForced = !!forceMode;

    let dbTransferred = false;
    let dbModifiedDuringSync = false;
    let filesTransferred = false;

    // 2. If remote DB is newer (or forced download) AND has changes, download and replace local DB
    const shouldDownload = (effectiveMode === 'download' || effectiveMode === 'bidirectional') && 
      (forceMode === 'download' || (remoteTimestamp > localTimestamp && hasDbChanges));

    if (shouldDownload) {
      console.log('Remote DB is newer and has changes (or forced download). Downloading...');
      
      let downloadedBytes: Uint8Array;
      if (await client.exists('/' + REMOTE_DB_FILE_GZ)) {
        console.log('Downloading compressed remote DB...');
        const compressed = await client.getFileContents('/' + REMOTE_DB_FILE_GZ, { format: 'binary' }) as Uint8Array;
        downloadedBytes = await decompressGzip(compressed);
      } else {
        console.log('Downloading uncompressed remote DB (fallback)...');
        downloadedBytes = await client.getFileContents('/' + BACKUP_DB_FILE, { format: 'binary' }) as Uint8Array;
      }

      // Write download to the backup path
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(localBackupPath, downloadedBytes);

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
        webdavSyncMode: store.settings.webdavSyncMode
      };

      // Replace active DB
      await replaceDatabase(localBackupPath);
      
      // Clean up temp file
      await remove(localBackupPath);

      const db = getDb();
      // Restore local attempts to the newly downloaded database
      await syncAttemptsTableWithFiles(db);

      const downloadedSettings = await getSettings(db);
      const mergedSettings = {
        ...(downloadedSettings || defaultSettings),
        ...localWebDavSettings
      };
      await saveSettings(db, mergedSettings);
      store.settings = mergedSettings;

      // Update sync parameters in memory and AppData file
      const finalTimestamp = remoteTimestamp >= localTimestamp ? remoteTimestamp : localTimestamp;
      await saveLocalSyncState(finalTimestamp, remoteDbHash || localDbHash);
      store.settings.lastSyncedTimestamp = finalTimestamp;
      store.settings.lastSyncedDbHash = remoteDbHash || localDbHash;

      dbTransferred = true;
    } else {
      // Since we did not download, we clean up the local temp backup file created for hashing
      await remove(localBackupPath);
    }

    // 3. Media Sync & Canvas Data Sync (only if DB has changes, or is forced, or remote hash unknown)
    if (!isForced && remoteDbHash && !hasDbChanges) {
      console.log('[WebDAV Sync] DB hashes match and sync is not forced. Skipping media and canvas file scans.');
    } else {
      // 3. Media Sync
      try {
        const mediaTransferred = await syncMedia(client, effectiveMode);
        if (mediaTransferred) {
          filesTransferred = true;
        }
      } catch (mediaErr) {
        console.error('Failed to sync media:', mediaErr);
      }

      // 3.5. Canvas Data Sync
      try {
        const canvasRes = await syncCanvasData(client, effectiveMode, shouldDownload);
        dbModifiedDuringSync = canvasRes.dbModified;
        if (canvasRes.filesTransferred) {
          filesTransferred = true;
        }
      } catch (canvasErr) {
        console.error('Failed to sync canvas data:', canvasErr);
      }
    }

    // Reload store state in-place to update UI without window reload
    if (shouldDownload || dbModifiedDuringSync || filesTransferred) {
      await store.loadState();
    }

    // 4. Upload Local DB to WebDAV if it has changes (and mode allows it)
    const shouldUpload = (effectiveMode === 'bidirectional' || effectiveMode === 'upload') && 
      (forceMode === 'upload' || (remoteTimestamp <= localTimestamp && hasDbChanges && !shouldDownload) || dbModifiedDuringSync);

    if (shouldUpload) {
      console.log('Uploading local DB to WebDAV...');
      await backupDatabase(localBackupPath);
      const finalDbBytes = await readFile(localBackupPath);
      const localDbHashAfterSync = await computeSha256(finalDbBytes);
      const compressedBytes = await compressGzip(finalDbBytes);
      await client.putFileContents('/' + REMOTE_DB_FILE_GZ, compressedBytes, { overwrite: true });

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
      await client.putFileContents('/' + SYNC_META_FILE, JSON.stringify({ 
        lastSyncedTimestamp: newTimestamp,
        dbHash: localDbHashAfterSync,
        version: localVersion
      }), { overwrite: true });

      // Save locally (in memory and file only)
      store.settings.lastSyncedTimestamp = newTimestamp;
      store.settings.lastSyncedDbHash = localDbHashAfterSync;
      await saveLocalSyncState(newTimestamp, localDbHashAfterSync);
      await remove(localBackupPath);
      dbTransferred = true;
    } else {
      // If we skipped both download and upload because the database hashes match, 
      // we still update the local settings' lastSyncedTimestamp to remoteTimestamp (if remote is equal)
      // to keep local and remote sync status in alignment.
      if (!hasDbChanges && !shouldDownload && remoteTimestamp !== '0') {
        store.settings.lastSyncedTimestamp = remoteTimestamp;
        store.settings.lastSyncedDbHash = localDbHash;
        await saveLocalSyncState(remoteTimestamp, localDbHash);
      }

      // If the local version is newer, update the remote version metadata on WebDAV
      if (localVersionIsNewer) {
        const metaTimestamp = remoteTimestamp !== '0' ? remoteTimestamp : new Date().toISOString();
        await client.putFileContents('/' + SYNC_META_FILE, JSON.stringify({ 
          lastSyncedTimestamp: metaTimestamp,
          dbHash: localDbHash,
          version: localVersion
        }), { overwrite: true });
      }
    }

    if (dbTransferred || filesTransferred) {
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

async function syncCanvasData(client: WebDAVClient, syncMode: 'bidirectional' | 'download' | 'upload', didDownloadDB: boolean): Promise<{ dbModified: boolean; filesTransferred: boolean }> {
  const db = getDb();
  const localCanvasDir = await getCanvasDataDir();
  const REMOTE_CANVAS_DIR = '/canvas_data';

  // Ensure remote canvas_data dir exists
  if (!(await client.exists(REMOTE_CANVAS_DIR))) {
    await client.createDirectory(REMOTE_CANVAS_DIR);
  }

  // 1. Get all attempt sync items from the database (only attempts are synced)
  const dbAttemptRows = await db.select(`
    SELECT id, timestamp FROM task_attempts
  `) as Array<{ id: string; timestamp: string }>;

  // 2. Build a map of all expected sync items
  const syncItems = new Map<string, {
    dbId: string;
    localName: string;
    remoteName: string;
    dbTimestamp: string;
  }>();

  for (const row of dbAttemptRows) {
    syncItems.set(row.id, {
      dbId: row.id,
      localName: `${row.id}.json`,
      remoteName: `${row.id}.json.gz`,
      dbTimestamp: row.timestamp
    });
  }

  // Get local canvas_data list from the filesystem
  let localEntries: any[] = [];
  try {
    if (await exists(localCanvasDir)) {
      localEntries = await readDir(localCanvasDir);
    }
  } catch (err) {
    console.error('Failed to read local canvas_data directory:', err);
  }

  const localFiles = new Map<string, { name: string }>();
  for (const entry of localEntries) {
    if (entry.isFile && entry.name && entry.name.endsWith('.json') && entry.name !== 'canvas_metadata.json') {
      const id = entry.name.substring(0, entry.name.length - 5); // strip '.json'
      localFiles.set(id, { name: entry.name });
    }
  }

  // Get remote canvas_data list
  const remoteMap = new Map<string, { basename: string; lastmod: Date }>();
  try {
    const remoteItems = await client.getDirectoryContents(REMOTE_CANVAS_DIR);
    for (const item of remoteItems) {
      if (item.type === 'file' && item.basename.endsWith('.json.gz')) {
        const id = item.basename.substring(0, item.basename.length - 8); // strip '.json.gz'
        remoteMap.set(id, { basename: item.basename, lastmod: new Date(item.lastmod) });
      }
    }
  } catch (err) {
    console.warn('Failed to retrieve remote canvas_data list:', err);
  }

  // Load all local metadata timestamps
  const localMetadata = await loadAllCanvasMetadata();

  let dbModified = false;
  let filesTransferred = false;

  // Sync all sync items
  for (const [id, item] of syncItems.entries()) {
    const localInfo = localFiles.get(id);
    const remoteInfo = remoteMap.get(id);

    const hasLocal = !!localInfo;
    const hasRemote = !!remoteInfo;

    if (hasLocal && !hasRemote) {
      if (syncMode === 'bidirectional' || syncMode === 'upload') {
        console.log(`Uploading canvas ${id}...`);
        try {
          const filePath = await join(localCanvasDir, item.localName);
          const rawBytes = await readFile(filePath);
          const compressed = await compressGzip(rawBytes);
          await client.putFileContents(`${REMOTE_CANVAS_DIR}/${item.remoteName}`, compressed, { overwrite: true });
          
          const remoteStat = await client.stat(`${REMOTE_CANVAS_DIR}/${item.remoteName}`);
          const actualRemoteTimeStr = (remoteStat && remoteStat.lastmod) ? new Date(remoteStat.lastmod).toISOString() : new Date().toISOString();
          await updateLocalCanvasMetadata(id, actualRemoteTimeStr);
          filesTransferred = true;
          dbModified = true;
        } catch (err) {
          console.error(`Failed to upload canvas ${id}:`, err);
        }
      }
    } else if (!hasLocal && hasRemote) {
      if (syncMode === 'bidirectional' || syncMode === 'download') {
        console.log(`Downloading canvas ${id}...`);
        try {
          const compressed = await client.getFileContents(`${REMOTE_CANVAS_DIR}/${item.remoteName}`, { format: 'binary' }) as Uint8Array;
          const decompressed = await decompressGzip(compressed);
          const filePath = await join(localCanvasDir, item.localName);
          const { writeFile } = await import('@tauri-apps/plugin-fs');
          await writeFile(filePath, decompressed);

          await updateLocalCanvasMetadata(id, remoteInfo.lastmod.toISOString());
          filesTransferred = true;
        } catch (err) {
          console.error(`Failed to download canvas ${id}:`, err);
        }
      }
    } else if (hasLocal && hasRemote) {
      const localTimeStr = item.dbTimestamp || new Date(0).toISOString();
      const localTime = new Date(localTimeStr).getTime();
      const remoteTime = remoteInfo.lastmod.getTime();
      const lastSyncedTimeStr = localMetadata[id] || new Date(0).toISOString();
      const lastSyncedTime = new Date(lastSyncedTimeStr).getTime();

      const isLocalChanged = localTime > lastSyncedTime + 1000;
      const isRemoteChanged = remoteTime > lastSyncedTime + 1000;

      if (isRemoteChanged && !isLocalChanged) {
        if (syncMode === 'bidirectional' || syncMode === 'download') {
          console.log(`Downloading newer remote canvas ${id} (remote: ${remoteInfo.lastmod.toISOString()}, last synced: ${lastSyncedTimeStr})...`);
          try {
            const compressed = await client.getFileContents(`${REMOTE_CANVAS_DIR}/${item.remoteName}`, { format: 'binary' }) as Uint8Array;
            const decompressed = await decompressGzip(compressed);
            const filePath = await join(localCanvasDir, item.localName);
            const { writeFile } = await import('@tauri-apps/plugin-fs');
            await writeFile(filePath, decompressed);
            await updateLocalCanvasMetadata(id, remoteInfo.lastmod.toISOString());
            filesTransferred = true;
          } catch (err) {
            console.error(`Failed to download canvas ${id}:`, err);
          }
        }
      } else if (isLocalChanged && !isRemoteChanged) {
        if (syncMode === 'bidirectional' || syncMode === 'upload') {
          console.log(`Uploading newer local canvas ${id} (local: ${localTimeStr}, last synced: ${lastSyncedTimeStr})...`);
          try {
            const filePath = await join(localCanvasDir, item.localName);
            const rawBytes = await readFile(filePath);
            const compressed = await compressGzip(rawBytes);
            await client.putFileContents(`${REMOTE_CANVAS_DIR}/${item.remoteName}`, compressed, { overwrite: true });
            
            const remoteStat = await client.stat(`${REMOTE_CANVAS_DIR}/${item.remoteName}`);
            const actualRemoteTimeStr = (remoteStat && remoteStat.lastmod) ? new Date(remoteStat.lastmod).toISOString() : new Date().toISOString();
            await updateLocalCanvasMetadata(id, actualRemoteTimeStr);
            filesTransferred = true;
            dbModified = true;
          } catch (err) {
            console.error(`Failed to upload canvas ${id}:`, err);
          }
        }
      } else if (isLocalChanged && isRemoteChanged) {
        if (localTime > remoteTime) {
          if (syncMode === 'bidirectional' || syncMode === 'upload') {
            console.log(`Conflict on ${id}: Local is newer (${localTimeStr} > ${remoteInfo.lastmod.toISOString()}). Uploading...`);
            try {
              const filePath = await join(localCanvasDir, item.localName);
              const rawBytes = await readFile(filePath);
              const compressed = await compressGzip(rawBytes);
              await client.putFileContents(`${REMOTE_CANVAS_DIR}/${item.remoteName}`, compressed, { overwrite: true });
              const remoteStat = await client.stat(`${REMOTE_CANVAS_DIR}/${item.remoteName}`);
              const actualRemoteTimeStr = (remoteStat && remoteStat.lastmod) ? new Date(remoteStat.lastmod).toISOString() : new Date().toISOString();
              await updateLocalCanvasMetadata(id, actualRemoteTimeStr);
              filesTransferred = true;
              dbModified = true;
            } catch (err) {
              console.error(`Failed to resolve conflict by uploading canvas ${id}:`, err);
            }
          }
        } else {
          if (syncMode === 'bidirectional' || syncMode === 'download') {
            console.log(`Conflict on ${id}: Remote is newer (${remoteInfo.lastmod.toISOString()} > ${localTimeStr}). Downloading...`);
            try {
              const compressed = await client.getFileContents(`${REMOTE_CANVAS_DIR}/${item.remoteName}`, { format: 'binary' }) as Uint8Array;
              const decompressed = await decompressGzip(compressed);
              const filePath = await join(localCanvasDir, item.localName);
              const { writeFile } = await import('@tauri-apps/plugin-fs');
              await writeFile(filePath, decompressed);
              await updateLocalCanvasMetadata(id, remoteInfo.lastmod.toISOString());
              filesTransferred = true;
            } catch (err) {
              console.error(`Failed to resolve conflict by downloading canvas ${id}:`, err);
            }
          }
        }
      }
    }
  }

  // Cleanup local orphaned files
  for (const [id, localInfo] of localFiles.entries()) {
    if (!syncItems.has(id)) {
      console.log(`Deleting local orphaned canvas/editor data ${localInfo.name}...`);
      try {
        const filePath = await join(localCanvasDir, localInfo.name);
        await remove(filePath);
        filesTransferred = true;
      } catch (err) {
        console.error(`Failed to delete local orphaned canvas ${localInfo.name}:`, err);
      }
    }
  }

  // Cleanup remote orphaned files
  if (syncMode === 'bidirectional' || syncMode === 'upload') {
    for (const [id, remoteInfo] of remoteMap.entries()) {
      if (!syncItems.has(id)) {
        console.log(`Deleting remote orphaned canvas/editor data ${remoteInfo.basename}...`);
        try {
          await client.deleteFile(`${REMOTE_CANVAS_DIR}/${remoteInfo.basename}`);
          filesTransferred = true;
        } catch (err) {
          console.error(`Failed to delete remote orphaned canvas ${remoteInfo.basename}:`, err);
        }
      }
    }
  }

  return { dbModified, filesTransferred };
}

async function syncMedia(client: WebDAVClient, syncMode: 'bidirectional' | 'download' | 'upload'): Promise<boolean> {
  let filesTransferred = false;
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
            filesTransferred = true;
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
          filesTransferred = true;
        } catch (err) {
          console.error(`Failed to download media ${id} from WebDAV:`, err);
          // Create a local placeholder (0-byte file) to prevent repeated download attempts and sync failures
          try {
            const filePath = await join(mediaDir, id);
            const { writeFile } = await import('@tauri-apps/plugin-fs');
            await writeFile(filePath, new Uint8Array(0));
            console.log(`Created empty local placeholder file for missing remote media ${id}`);
            filesTransferred = true;
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
        filesTransferred = true;
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
          filesTransferred = true;
        } catch (err) {
          console.error(`Failed to delete remote orphaned media ${basename}:`, err);
        }
      }
    }
  }

  return filesTransferred;
}
