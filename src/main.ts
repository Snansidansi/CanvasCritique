import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { invoke } from '@tauri-apps/api/core';

// Intercept global window.fetch at the very entry point of the application.
// This is required to bypass CORS and mixed-content restrictions in the WebView by routing HTTP/HTTPS requests
// through Tauri's Rust-backed HTTP plugin. It also resolves a race condition where libraries (like @buttercup/fetch used by webdav)
// capture the global fetch function at module-load time before other modules can overwrite it.
if (typeof window !== 'undefined') {
  (window as any).__open_file = async (path: string) => {
    try {
      await invoke('open_file', { path });
    } catch (e) {
      console.error('Failed to open file via Tauri:', e);
    }
  };

  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else if (input && typeof input === 'object' && 'url' in input) {
      url = (input as any).url;
    }

    if (
      (url.startsWith('http://') || url.startsWith('https://')) &&
      !url.includes('localhost') &&
      !url.includes('127.0.0.1')
    ) {
      try {
        let parsedInit = init || {};
        
        // If input is a Request-like object, extract options from it
        if (input && typeof input === 'object' && !(input instanceof URL)) {
          const reqObj = input as any;
          parsedInit = {
            method: reqObj.method || parsedInit.method,
            headers: parsedInit.headers || {},
            ...parsedInit
          };
          
          // Extract headers from the Request object
          const reqHeaders: Record<string, string> = {};
          if (reqObj.headers && typeof reqObj.headers.forEach === 'function') {
            reqObj.headers.forEach((val: any, key: any) => {
              reqHeaders[String(key)] = String(val);
            });
          } else if (reqObj.headers && typeof reqObj.headers === 'object') {
            for (const [key, val] of Object.entries(reqObj.headers)) {
              reqHeaders[key] = String(val);
            }
          }
          
          // Merge with init headers
          const initHeaders: Record<string, string> = {};
          if (init && init.headers) {
            if (typeof (init.headers as any).forEach === 'function') {
              (init.headers as any).forEach((val: any, key: any) => {
                initHeaders[String(key)] = String(val);
              });
            } else if (typeof init.headers === 'object') {
              for (const [key, val] of Object.entries(init.headers)) {
                initHeaders[key] = String(val);
              }
            }
          }
          
          parsedInit.headers = { ...reqHeaders, ...initHeaders };

          // Extract body if present
          if (reqObj.body && !parsedInit.body) {
            try {
              if (typeof reqObj.clone === 'function') {
                const cloned = reqObj.clone();
                parsedInit.body = await cloned.arrayBuffer();
              }
            } catch (bodyErr) {
              console.warn('[Global Fetch Interceptor] Failed to clone request body:', bodyErr);
            }
          }
        } else {
          // Normalize normal init headers
          if (init && init.headers) {
            const plainHeaders: Record<string, string> = {};
            if (typeof (init.headers as any).forEach === 'function') {
              (init.headers as any).forEach((val: any, key: any) => {
                plainHeaders[String(key)] = String(val);
              });
            } else {
              for (const [key, val] of Object.entries(init.headers)) {
                plainHeaders[key] = String(val);
              }
            }
            parsedInit = { ...init, headers: plainHeaders };
          }
        }
        
        // Pass the URL string instead of the potentially custom/complex Request object
        return await tauriFetch(url, parsedInit as any);
      } catch (err) {
        console.error('[Global Fetch Interceptor] Failed to route request through Tauri HTTP plugin:', err);
        throw err;
      }
    }
    return originalFetch(input, init);
  };
}

import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { store } from './lib/state/store.svelte'

async function start() {
  await store.init()
  const app = mount(App, {
    target: document.getElementById('app'),
  })
  return app
}

export default start()
