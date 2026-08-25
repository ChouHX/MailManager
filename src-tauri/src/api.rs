use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::HashMap,
    sync::{LazyLock, RwLock},
};
use tauri::Emitter;

use crate::mail::{fetch_mailbox, validate_fetch_request, FetchMailboxRequest, MailAccount};

pub(crate) const API_ADDRESS: &str = "127.0.0.1:18765";

static ACCOUNTS: LazyLock<RwLock<HashMap<String, MailAccount>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

#[derive(Debug, Deserialize)]
struct ApiFetchRequest {
    email: String,
    #[serde(default = "default_protocol")]
    protocol: String,
    #[serde(default = "default_folder")]
    folder: String,
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default)]
    offset: usize,
}

#[derive(Clone, Serialize)]
struct TokenUpdate {
    email: String,
    refresh_token: String,
}

fn default_protocol() -> String {
    "imap".to_string()
}

fn default_folder() -> String {
    "inbox".to_string()
}

fn default_limit() -> usize {
    20
}

fn account_key(email: &str) -> String {
    email.trim().to_lowercase()
}

#[tauri::command]
pub fn sync_api_accounts(accounts: Vec<MailAccount>) -> Result<(), String> {
    let next = accounts
        .into_iter()
        .map(|account| (account_key(&account.email), account))
        .collect();
    *ACCOUNTS
        .write()
        .map_err(|_| "API 账号存储暂时不可用".to_string())? = next;
    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(json!({
        "success": true,
        "data": {
            "service": "ccmtc-mail-api",
            "version": env!("CARGO_PKG_VERSION")
        }
    }))
}

async fn fetch_messages(
    axum::extract::State(app_handle): axum::extract::State<tauri::AppHandle>,
    Json(request): Json<ApiFetchRequest>,
) -> impl IntoResponse {
    if request.email.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "email 为必填项" })),
        );
    }

    let account = match ACCOUNTS
        .read()
        .map_err(|_| "API 账号存储暂时不可用".to_string())
        .and_then(|accounts| {
            accounts
                .get(&account_key(&request.email))
                .cloned()
                .ok_or_else(|| "未找到该邮箱，请先在应用中导入账号".to_string())
        }) {
        Ok(account) => account,
        Err(message) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": message })),
            );
        }
    };

    let fetch_request = FetchMailboxRequest {
        account: account.clone(),
        protocol: request.protocol,
        folder: request.folder,
        limit: request.limit,
        offset: request.offset,
    };
    if let Err(message) = validate_fetch_request(&fetch_request) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": message })),
        );
    }

    match fetch_mailbox(fetch_request).await {
        Ok(result) => {
            if result.refresh_token != account.refresh_token {
                if let Ok(mut accounts) = ACCOUNTS.write() {
                    if let Some(stored) = accounts.get_mut(&account_key(&account.email)) {
                        stored.refresh_token = result.refresh_token.clone();
                    }
                }
                let _ = app_handle.emit(
                    "api-refresh-token",
                    TokenUpdate {
                        email: account.email,
                        refresh_token: result.refresh_token.clone(),
                    },
                );
            }
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "data": {
                        "total": result.total,
                        "messages": result.messages
                    }
                })),
            )
        }
        Err(message) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "success": false, "error": message })),
        ),
    }
}

async fn serve(app_handle: tauri::AppHandle) -> Result<(), String> {
    let app = Router::new()
        .route("/api/v1/health", get(health))
        .route("/api/v1/messages", post(fetch_messages))
        .with_state(app_handle);
    let listener = tokio::net::TcpListener::bind(API_ADDRESS)
        .await
        .map_err(|error| format!("无法监听 {API_ADDRESS}: {error}"))?;
    axum::serve(listener, app)
        .await
        .map_err(|error| format!("API 服务异常退出: {error}"))
}

pub(crate) fn start(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = serve(app_handle).await {
            eprintln!("CCMTC Mail API 启动失败: {error}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_email_only_request() {
        let request: ApiFetchRequest =
            serde_json::from_str(r#"{"email":"mail@example.com"}"#).unwrap();
        assert_eq!(request.email, "mail@example.com");
        assert_eq!(request.protocol, "imap");
        assert_eq!(request.folder, "inbox");
        assert_eq!(request.limit, 20);
        assert_eq!(request.offset, 0);
    }
}
