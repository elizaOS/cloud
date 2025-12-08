//! Eliza Cloud Mobile App
//!
//! A native iOS/Android app for elizacloud.ai using Tauri v2.
//! Provides:
//! - Deep link handling for OAuth callbacks
//! - In-App Purchase integration (StoreKit 2 / Google Play Billing)
//! - Platform detection for mobile-specific UI

mod iap;

use tauri::AppHandle;

#[cfg(any(target_os = "ios", target_os = "android"))]
use tauri::Emitter;
#[cfg(any(target_os = "ios", target_os = "android"))]
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            is_mobile_app,
            iap::get_products,
            iap::purchase_product,
            iap::restore_purchases,
        ])
        .setup(|app| {
            setup_deep_links(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Eliza Cloud");
}

fn setup_deep_links(app: AppHandle) {
    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        let app_handle = app.clone();
        app.deep_link().on_open_url(move |event| {
            if let Some(url) = event.urls().first() {
                let url_string = url.to_string();
                log::info!("Deep link received: {}", url_string);
                
                if url_string.contains("auth/callback") {
                    let _ = app_handle.emit("auth-callback", url_string.clone());
                }
                let _ = app_handle.emit("deep-link", url_string);
            }
        });
    }
    
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        let _ = app;
    }
}

#[tauri::command]
fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        is_mobile: cfg!(any(target_os = "ios", target_os = "android")),
        is_ios: cfg!(target_os = "ios"),
        is_android: cfg!(target_os = "android"),
    }
}

#[tauri::command]
fn is_mobile_app() -> bool {
    true
}

#[derive(serde::Serialize)]
struct PlatformInfo {
    os: String,
    arch: String,
    is_mobile: bool,
    is_ios: bool,
    is_android: bool,
}
