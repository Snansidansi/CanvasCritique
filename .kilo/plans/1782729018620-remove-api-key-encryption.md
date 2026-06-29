# Remove API Key Encryption

## Problem
API keys become invalid on every app restart because the AES-256-GCM encryption key file (`.encryption_key`) stored in the app's local data directory is lost/recreated, making old encrypted data unreadable.

## Solution
Remove all encryption/decryption of API keys. Store them as plaintext in the SQLite `settings.data_json` column.

## Changes

### 1. `src/lib/db.ts`
- Remove line 4: `import { encrypt, decrypt } from './db/crypto';`
- In `getSettings()` (lines 170-181): Remove the `decrypt()` calls for `geminiApiKey` and `openRouterApiKey`
- In `saveSettings()` (lines 183-196): Remove the `encrypt()` calls for `geminiApiKey` and `openRouterApiKey`

### 2. Delete `src/lib/db/crypto.ts`
- No longer needed. This file contained the `encrypt`/`decrypt` wrappers that called Rust Tauri commands.

### 3. Delete `src-tauri/src/crypto.rs`
- No longer needed. This file contained the Rust `encrypt_api_key`/`decrypt_api_key` Tauri commands.

### 4. `src-tauri/src/main.rs`
- Remove `mod crypto;` (line 4)
- Remove `crypto::encrypt_api_key, crypto::decrypt_api_key` from the `invoke_handler` registration (lines 12-13)

## Impact
- Previously encrypted API keys in the database will become unreadable gibberish. Since the encryption key is already lost (that's the root cause of the bug), there's nothing to migrate. Users will re-enter their API keys once, after which they persist correctly as plaintext.
- No other functionality is affected — encryption is only used for these two API key fields.
