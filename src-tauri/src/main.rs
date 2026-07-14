// Prevents additional console window on Windows in release, do not remove!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{State, Emitter};

struct AppState {
    sync_on_shutdown: Mutex<bool>,
}

#[tauri::command]
fn set_sync_on_shutdown(state: State<'_, AppState>, enabled: bool) {
    let mut sync = state.sync_on_shutdown.lock().unwrap();
    *sync = enabled;
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            sync_on_shutdown: Mutex::new(false),
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                let _ = window.emit("trigger-shutdown-sync", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_file,
            set_sync_on_shutdown,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
