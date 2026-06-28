import { invoke } from '@tauri-apps/api/core';

export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  return await invoke('encrypt_api_key', { plaintext });
}

export async function decrypt(encrypted: string): Promise<string> {
  if (!encrypted) return '';
  return await invoke('decrypt_api_key', { encrypted });
}
