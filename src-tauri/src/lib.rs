mod ad;
mod api;
mod mail;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    mail::install_crypto_provider();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            api::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ad::fetch_ad_config,
            api::sync_api_accounts,
            mail::fetch_mailbox
        ])
        .run(tauri::generate_context!())
        .expect("error while running CCMTC Mail");
}
