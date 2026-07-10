import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { store } from '../state/store.svelte';
import { t } from './i18n';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { writeFile, exists, remove } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import pkg from '../../../package.json';

const INSTALLER_FILENAME = 'canvascritique_installer.exe';
const GITHUB_RELEASES_URL = 'https://api.github.com/repos/Snansidansi/CanvasCritique/releases/latest';

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
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

export async function cleanupInstaller(): Promise<void> {
  try {
    const localAppDir = await appLocalDataDir();
    const installerPath = await join(localAppDir, INSTALLER_FILENAME);
    if (await exists(installerPath)) {
      console.log('[Update Service] Found old installer file, deleting...');
      await remove(installerPath);
    }
  } catch (err) {
    console.error('[Update Service] Failed to cleanup installer:', err);
  }
}

async function downloadAndInstall(downloadUrl: string): Promise<void> {
  try {
    store.showNotification(t('settings.update.downloadStarted') || 'Lade Update herunter...', 'info');
    
    const response = await tauriFetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    const localAppDir = await appLocalDataDir();
    const installerPath = await join(localAppDir, INSTALLER_FILENAME);
    
    await writeFile(installerPath, bytes);
    
    store.showNotification(t('settings.update.downloadFinished') || 'Download abgeschlossen. Installateur wird gestartet...', 'success');
    
    // Run installer and close the app
    await invoke('open_file', { path: installerPath });
    await invoke('exit_app');
  } catch (err: any) {
    console.error('[Update Service] Download and install failed:', err);
    store.showNotification(t('settings.update.error') || 'Update fehlgeschlagen.', 'error');
  }
}

export async function checkForUpdates(isManual: boolean = false): Promise<void> {
  try {
    console.log(`[Update Service] Checking for updates (manual: ${isManual})...`);
    const response = await tauriFetch(GITHUB_RELEASES_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CanvasCritique-Updater'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned status ${response.status}`);
    }

    const release = await response.json() as GitHubRelease;
    const latestVersionStr = release.tag_name.startsWith('v') ? release.tag_name.slice(1) : release.tag_name;
    const currentVersionStr = pkg.version;

    console.log(`[Update Service] Local version: ${currentVersionStr}, Latest on GitHub: ${latestVersionStr}`);

    const hasNewerVersion = compareVersions(currentVersionStr, latestVersionStr) < 0;

    if (hasNewerVersion) {
      // Find the .exe installer asset
      const exeAsset = release.assets.find(asset => asset.name.endsWith('.exe'));
      if (!exeAsset) {
        console.warn('[Update Service] No .exe installer found in assets of latest release.');
        if (isManual) {
          store.showNotification(t('settings.update.noInstallerFound') || 'Keine Installationsdatei gefunden.', 'error');
        }
        return;
      }

      if (!isManual) {
        // Automatic update check should respect the skipped version
        const skippedVersion = localStorage.getItem('skipped_update_version');
        if (skippedVersion === latestVersionStr) {
          console.log(`[Update Service] Latest version ${latestVersionStr} matches skipped version. Ignoring.`);
          return;
        }

        // Show update popup with 'Skip' option
        store.confirm(
          t('settings.update.popupTitle') || 'Update verfügbar',
          t('settings.update.popupMsg', { version: latestVersionStr }) || `Eine neue Version (${latestVersionStr}) ist verfügbar. Möchtest du sie jetzt installieren?`,
          // Yes: Download and run
          () => {
            downloadAndInstall(exeAsset.browser_download_url);
          },
          // No: Do nothing
          () => {},
          false, // isAlert: false
          t('settings.update.btnYes') || 'Ja',
          t('settings.update.btnNo') || 'Nein',
          t('settings.update.btnSkip') || 'Version überspringen',
          // Skip version
          () => {
            localStorage.setItem('skipped_update_version', latestVersionStr);
          },
          true // isPrimary: true
        );
      } else {
        // Manual update check should NOT show 'Skip' button, and ignores skipped_update_version
        store.confirm(
          t('settings.update.popupTitle') || 'Update verfügbar',
          t('settings.update.popupMsg', { version: latestVersionStr }) || `Eine neue Version (${latestVersionStr}) ist verfügbar. Möchtest du sie jetzt installieren?`,
          // Yes: Download and run
          () => {
            downloadAndInstall(exeAsset.browser_download_url);
          },
          // No: Do nothing
          () => {},
          false, // isAlert: false
          t('settings.update.btnYes') || 'Ja',
          t('settings.update.btnNo') || 'Nein',
          undefined, // no third button
          null,
          true // isPrimary: true
        );
      }
    } else {
      if (isManual) {
        store.showNotification(t('settings.update.noUpdates') || 'Du hast bereits die neueste Version.', 'success');
      }
    }
  } catch (err: any) {
    console.error('[Update Service] Error checking for updates:', err);
    if (isManual) {
      store.showNotification(t('settings.update.checkError') || 'Fehler beim Suchen nach Updates.', 'error');
    }
  }
}
