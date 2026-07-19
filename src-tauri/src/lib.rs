mod ad;
mod mail;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    mail::install_crypto_provider();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            ad::fetch_ad_config,
            mail::fetch_mailbox,
            mail::health_check
        ])
        .run(tauri::generate_context!())
        .expect("error while running CCMTC Mail");
}
