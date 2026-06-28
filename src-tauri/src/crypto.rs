use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const KEY_FILE_NAME: &str = ".encryption_key";

fn get_key_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    Ok(data_dir.join(KEY_FILE_NAME))
}

fn get_or_create_key(app_handle: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    let key_path = get_key_path(app_handle)?;
    if key_path.exists() {
        fs::read(&key_path).map_err(|e| format!("Failed to read encryption key: {}", e))
    } else {
        let mut key = vec![0u8; 32];
        OsRng.fill_bytes(&mut key);
        fs::write(&key_path, &key)
            .map_err(|e| format!("Failed to write encryption key: {}", e))?;
        Ok(key)
    }
}

#[tauri::command]
pub fn encrypt_api_key(
    app_handle: tauri::AppHandle,
    plaintext: String,
) -> Result<String, String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }
    let key_bytes = get_or_create_key(&app_handle)?;
    let key = aes_gcm::Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    Ok(base64_encode(&combined))
}

#[tauri::command]
pub fn decrypt_api_key(
    app_handle: tauri::AppHandle,
    encrypted: String,
) -> Result<String, String> {
    if encrypted.is_empty() {
        return Ok(String::new());
    }
    let key_bytes = get_or_create_key(&app_handle)?;
    let key = aes_gcm::Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let combined = base64_decode(&encrypted)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    if combined.len() < 12 {
        return Err("Invalid encrypted data".to_string());
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;
    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {}", e))
}

fn base64_encode(data: &[u8]) -> String {
    use std::fmt::Write;
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((n >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((n >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((n >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(n & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

fn base64_decode(encoded: &str) -> Result<Vec<u8>, String> {
    const DECODE: [i8; 128] = {
        let mut table = [-1i8; 128];
        let chars = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut i = 0u8;
        while i < 64 {
            table[chars[i as usize] as usize] = i as i8;
            i += 1;
        }
        table
    };

    let encoded = encoded.trim_end_matches('=');
    let mut result = Vec::with_capacity(encoded.len() * 3 / 4);
    let bytes: Vec<u8> = encoded.bytes().collect();
    for chunk in bytes.chunks(4) {
        let mut buf = 0u32;
        let mut count = 0;
        for &b in chunk {
            if b as usize >= 128 {
                return Err("Invalid base64 character".to_string());
            }
            let val = DECODE[b as usize];
            if val < 0 {
                return Err("Invalid base64 character".to_string());
            }
            buf = (buf << 6) | val as u32;
            count += 1;
        }
        if count >= 2 {
            result.push((buf >> 16) as u8);
        }
        if count >= 3 {
            result.push((buf >> 8) as u8);
        }
        if count >= 4 {
            result.push(buf as u8);
        }
    }
    Ok(result)
}
