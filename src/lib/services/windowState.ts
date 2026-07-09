import { getCurrentWindow, availableMonitors } from '@tauri-apps/api/window';
import { PhysicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { store } from '../state/store.svelte';

/**
 * Checks if the application is running inside Tauri on a Windows platform.
 */
export function isWindowsPlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const isTauri = (window as any).__TAURI_INTERNALS__ !== undefined;
  const isWindows = navigator.userAgent.includes('Windows') || navigator.userAgent.includes('Win');
  return isTauri && isWindows;
}

let saveTimeoutId: any = null;

/**
 * Saves the current window state (size, position, maximized, fullscreen, and zoom level) to localStorage.
 * If the window is maximized or fullscreen, it keeps the last known normal size and position.
 */
async function saveWindowState() {
  if (!store.settings.rememberWindowState) return;
  try {
    const appWindow = getCurrentWindow();

    const isFullscreen = await appWindow.isFullscreen();
    const isMaximized = await appWindow.isMaximized();

    const state: any = {
      isMaximized,
      isFullscreen
    };

    // Calculate zoom level using devicePixelRatio and scale factor
    const scaleFactor = await appWindow.scaleFactor();
    state.zoomLevel = window.devicePixelRatio / scaleFactor;

    if (!isMaximized && !isFullscreen) {
      const pos = await appWindow.outerPosition();
      const size = await appWindow.outerSize();
      state.x = pos.x;
      state.y = pos.y;
      state.width = size.width;
      state.height = size.height;
    } else {
      // Retain the previously saved position/size so they are not lost
      const savedStateStr = localStorage.getItem('window_state');
      if (savedStateStr) {
        const savedState = JSON.parse(savedStateStr);
        state.x = savedState.x;
        state.y = savedState.y;
        state.width = savedState.width;
        state.height = savedState.height;
      }
    }

    localStorage.setItem('window_state', JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save window state:', err);
  }
}

/**
 * Debounces the save function to prevent rapid writing during resize/drag/zoom.
 */
function debouncedSave() {
  if (saveTimeoutId) clearTimeout(saveTimeoutId);
  saveTimeoutId = setTimeout(() => {
    saveWindowState();
  }, 300);
}

/**
 * Saves window state immediately, cancelling any scheduled debounced save.
 */
async function saveWindowStateImmediately() {
  if (saveTimeoutId) {
    clearTimeout(saveTimeoutId);
    saveTimeoutId = null;
  }
  await saveWindowState();
}

/**
 * Restores the window state from localStorage, verifying that the coordinates are valid and on a connected monitor.
 */
export async function restoreWindowState() {
  if (!store.settings.rememberWindowState) return;
  try {
    const savedStateStr = localStorage.getItem('window_state');
    if (!savedStateStr) return;

    const state = JSON.parse(savedStateStr);
    const { x, y, width, height, isMaximized, isFullscreen, zoomLevel } = state;

    const appWindow = getCurrentWindow();
    const webview = getCurrentWebview();

    // 1. Zoom level
    if (typeof zoomLevel === 'number') {
      await webview.setZoom(zoomLevel);
    }

    // 2. Position and Size (checked against current monitors)
    if (typeof x === 'number' && typeof y === 'number') {
      const monitors = await availableMonitors();
      const isPositionOnAnyMonitor = monitors.some(m => {
        const minX = m.position.x;
        const maxX = m.position.x + m.size.width;
        const minY = m.position.y;
        const maxY = m.position.y + m.size.height;
        return x >= minX && x < maxX && y >= minY && y < maxY;
      });

      if (isPositionOnAnyMonitor) {
        if (typeof width === 'number' && typeof height === 'number') {
          await appWindow.setSize(new PhysicalSize(width, height));
        }
        await appWindow.setPosition(new PhysicalPosition(x, y));
      }
    } else if (typeof width === 'number' && typeof height === 'number') {
      await appWindow.setSize(new PhysicalSize(width, height));
    }

    // 3. Maximized/Fullscreen state
    if (isFullscreen) {
      await appWindow.setFullscreen(true);
    } else if (isMaximized) {
      await appWindow.maximize();
    }
  } catch (err) {
    console.error('Failed to restore window state:', err);
  }
}

/**
 * Sets up listeners for resize, move, close-request, and zoom events.
 * Returns a cleanup function.
 */
export async function setupWindowStateListeners(): Promise<() => void> {
  const appWindow = getCurrentWindow();

  const unlistenResize = await appWindow.onResized(() => {
    debouncedSave();
  });

  const unlistenMove = await appWindow.onMoved(() => {
    debouncedSave();
  });

  const unlistenClose = await appWindow.onCloseRequested(async () => {
    await saveWindowStateImmediately();
  });

  // Standard resize listener (fires on browser-zoom change as layout viewport changes)
  window.addEventListener('resize', debouncedSave);

  return () => {
    if (unlistenResize) unlistenResize();
    if (unlistenMove) unlistenMove();
    if (unlistenClose) unlistenClose();
    window.removeEventListener('resize', debouncedSave);
    if (saveTimeoutId) clearTimeout(saveTimeoutId);
  };
}
