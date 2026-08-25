mod ad;
mod api;
mod mail;

#[tauri::command]
fn export_accounts(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|error| format!("写入导出文件失败: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    mail::install_crypto_provider();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            api::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ad::fetch_ad_config,
            api::sync_api_accounts,
            export_accounts,
            mail::fetch_mailbox
        ])
        .run(tauri::generate_context!())
        .expect("error while running CCMTC Mail");
}
