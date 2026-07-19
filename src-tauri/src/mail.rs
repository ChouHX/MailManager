use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::{TimeZone, Utc};
use mailparse::{parse_mail, MailHeaderMap, ParsedMail};
use regex::{bytes::Regex as BytesRegex, Regex};
use reqwest::Client;
use rustls::pki_types::ServerName;
use rustls::{ClientConfig, ClientConnection, RootCertStore, StreamOwned};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;
use std::time::Duration;

const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const IMAP_SCOPE: &str = "https://outlook.office.com/IMAP.AccessAsUser.All offline_access";
const GRAPH_SCOPE: &str = "https://graph.microsoft.com/.default";
const GRAPH_API_BASE: &str = "https://graph.microsoft.com/v1.0";
const IMAP_HOST: &str = "outlook.live.com";

pub(crate) fn install_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

#[derive(Debug, Clone, Deserialize)]
pub struct MailAccount {
    pub id: String,
    pub email: String,
    #[serde(default, rename = "password")]
    pub _password: String,
    pub client_id: String,
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
pub struct FetchMailboxRequest {
    pub account: MailAccount,
    pub protocol: String,
    #[serde(default = "default_folder")]
    pub folder: String,
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct MailMessage {
    pub id: String,
    pub protocol: String,
    pub folder: String,
    pub subject: String,
    pub sender: String,
    pub received_at: String,
    pub preview: String,
    pub body: String,
    pub body_type: String,
}

#[derive(Debug, Serialize)]
pub struct MailboxResult {
    pub account_id: String,
    pub email: String,
    pub protocol: String,
    pub total: usize,
    pub messages: Vec<MailMessage>,
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphAddressValue {
    #[serde(default)]
    name: String,
    #[serde(default)]
    address: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphAddress {
    email_address: GraphAddressValue,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphBody {
    #[serde(default)]
    content_type: String,
    #[serde(default)]
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphMessage {
    id: String,
    #[serde(default)]
    subject: String,
    sender: Option<GraphAddress>,
    #[serde(default)]
    received_date_time: String,
    #[serde(default)]
    body_preview: String,
    body: Option<GraphBody>,
}

#[derive(Debug, Deserialize)]
struct GraphListResponse {
    #[serde(default, rename = "@odata.count")]
    total: Option<usize>,
    #[serde(default)]
    value: Vec<GraphMessage>,
}

fn default_folder() -> String {
    "inbox".to_string()
}

fn default_limit() -> usize {
    20
}

fn normalized_folder(value: &str) -> (&'static str, &'static str) {
    match value.trim().to_lowercase().as_str() {
        "spam" | "junk" | "junkemail" => ("spam", "junkemail"),
        _ => ("inbox", "inbox"),
    }
}

fn compact_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_remote_error(body: &str, fallback: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return fallback.to_string();
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) else {
        return compact_text(trimmed);
    };
    let nested_error = value.get("error");
    let code = nested_error
        .and_then(|error| error.get("code"))
        .or_else(|| value.get("error"))
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let message = nested_error
        .and_then(|error| error.get("message"))
        .or_else(|| value.get("error_description"))
        .or_else(|| value.get("message"))
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    match (code.is_empty(), message.is_empty()) {
        (false, false) => format!("{code}: {}", compact_text(message)),
        (false, true) => code.to_string(),
        (true, false) => compact_text(message),
        (true, true) => compact_text(trimmed),
    }
}

fn strip_html(value: &str) -> String {
    let without_style = Regex::new(r"(?is)<(style|script)[^>]*>.*?</(style|script)>")
        .expect("valid regex")
        .replace_all(value, " ");
    let without_tags = Regex::new(r"(?is)<[^>]+>")
        .expect("valid regex")
        .replace_all(&without_style, " ");
    compact_text(
        &without_tags
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'"),
    )
}

fn body_preview(body: &str, body_type: &str) -> String {
    let text = if body_type.eq_ignore_ascii_case("html") {
        strip_html(body)
    } else {
        compact_text(body)
    };
    text.chars().take(180).collect()
}

fn find_mime_body(parsed: &ParsedMail<'_>, mime: &str) -> Option<String> {
    if parsed.ctype.mimetype.eq_ignore_ascii_case(mime) {
        return parsed.get_body().ok();
    }
    parsed
        .subparts
        .iter()
        .find_map(|part| find_mime_body(part, mime))
}

fn parse_raw_message(raw: &[u8], uid: u32, folder: &str) -> Result<MailMessage, String> {
    let parsed = parse_mail(raw).map_err(|error| format!("邮件解析失败: {error}"))?;
    let subject = parsed
        .headers
        .get_first_value("Subject")
        .unwrap_or_else(|| "(无主题)".to_string());
    let sender = parsed
        .headers
        .get_first_value("From")
        .unwrap_or_else(|| "未知发件人".to_string());
    let received_at = parsed
        .headers
        .get_first_value("Date")
        .and_then(|value| mailparse::dateparse(&value).ok())
        .and_then(|timestamp| Utc.timestamp_opt(timestamp, 0).single())
        .map(|value| value.to_rfc3339())
        .unwrap_or_default();
    let html = find_mime_body(&parsed, "text/html");
    let plain = find_mime_body(&parsed, "text/plain");
    let (body, body_type) = match (html, plain) {
        (Some(value), _) => (value, "html".to_string()),
        (_, Some(value)) => (value, "text".to_string()),
        _ => (
            parsed.get_body().unwrap_or_default(),
            if parsed.ctype.mimetype.eq_ignore_ascii_case("text/html") {
                "html".to_string()
            } else {
                "text".to_string()
            },
        ),
    };

    Ok(MailMessage {
        id: uid.to_string(),
        protocol: "imap".to_string(),
        folder: folder.to_string(),
        subject,
        sender,
        received_at,
        preview: body_preview(&body, &body_type),
        body,
        body_type,
    })
}

async fn refresh_access_token(
    client: &Client,
    account: &MailAccount,
    scope: &str,
) -> Result<(String, String), String> {
    let response = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", account.client_id.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", account.refresh_token.as_str()),
            ("scope", scope),
        ])
        .send()
        .await
        .map_err(|error| format!("Token 请求失败: {error}"))?;
    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|error| format!("Token 响应读取失败: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "OAuth Token 获取失败 (HTTP {}): {}",
            status.as_u16(),
            parse_remote_error(&response_text, "Microsoft OAuth 返回空错误")
        ));
    }
    let payload: OAuthTokenResponse = serde_json::from_str(&response_text)
        .map_err(|error| format!("Token 响应格式错误: {error}"))?;
    let next_refresh_token = if payload.refresh_token.is_empty() {
        account.refresh_token.clone()
    } else {
        payload.refresh_token
    };
    Ok((payload.access_token, next_refresh_token))
}

fn read_greeting(stream: &mut StreamOwned<ClientConnection, TcpStream>) -> Result<(), String> {
    let mut buffer = [0_u8; 4096];
    let count = stream
        .read(&mut buffer)
        .map_err(|error| format!("IMAP greeting 读取失败: {error}"))?;
    if count == 0 {
        return Err("IMAP 服务器未返回 greeting".to_string());
    }
    Ok(())
}

fn response_has_tag(buffer: &[u8], tag: &str) -> bool {
    String::from_utf8_lossy(buffer)
        .lines()
        .any(|line| line.starts_with(&format!("{tag} ")))
}

fn send_imap_command(
    stream: &mut StreamOwned<ClientConnection, TcpStream>,
    tag: &str,
    command: &str,
) -> Result<Vec<u8>, String> {
    stream
        .write_all(format!("{tag} {command}\r\n").as_bytes())
        .map_err(|error| format!("IMAP 命令发送失败: {error}"))?;
    stream
        .flush()
        .map_err(|error| format!("IMAP 命令刷新失败: {error}"))?;

    let mut response = Vec::new();
    let mut chunk = [0_u8; 16 * 1024];
    loop {
        let count = stream
            .read(&mut chunk)
            .map_err(|error| format!("IMAP 响应读取失败: {error}"))?;
        if count == 0 {
            return Err("IMAP 连接已关闭".to_string());
        }
        response.extend_from_slice(&chunk[..count]);
        if response.len() > 32 * 1024 * 1024 {
            return Err("单次 IMAP 响应超过 32MB".to_string());
        }
        if response_has_tag(&response, tag) {
            break;
        }
    }

    let text = String::from_utf8_lossy(&response);
    if !text
        .lines()
        .any(|line| line.starts_with(&format!("{tag} OK")))
    {
        return Err(compact_text(&text));
    }
    Ok(response)
}

fn parse_search_uids(response: &[u8]) -> Vec<u32> {
    String::from_utf8_lossy(response)
        .lines()
        .find_map(|line| line.strip_prefix("* SEARCH "))
        .unwrap_or_default()
        .split_whitespace()
        .filter_map(|value| value.parse::<u32>().ok())
        .collect()
}

fn recent_uids_page(uids: &[u32], offset: usize, limit: usize) -> Vec<u32> {
    uids.iter()
        .rev()
        .skip(offset)
        .take(limit.clamp(1, 100))
        .copied()
        .collect()
}

fn extract_imap_literal(response: &[u8]) -> Result<Vec<u8>, String> {
    let literal = BytesRegex::new(r"\{(\d+)\}\r\n").expect("valid literal regex");
    let captures = literal
        .captures(response)
        .ok_or_else(|| "IMAP FETCH 未返回邮件正文".to_string())?;
    let full = captures.get(0).expect("full literal match");
    let length = std::str::from_utf8(captures.get(1).expect("literal length capture").as_bytes())
        .map_err(|error| error.to_string())?
        .parse::<usize>()
        .map_err(|error| error.to_string())?;
    let start = full.end();
    let end = start.saturating_add(length);
    if end > response.len() {
        return Err("IMAP 邮件正文长度不完整".to_string());
    }
    Ok(response[start..end].to_vec())
}

fn fetch_imap_messages(
    account: &MailAccount,
    access_token: &str,
    folder: &str,
    limit: usize,
    offset: usize,
) -> Result<(usize, Vec<MailMessage>), String> {
    let socket =
        TcpStream::connect((IMAP_HOST, 993)).map_err(|error| format!("IMAP 连接失败: {error}"))?;
    socket
        .set_read_timeout(Some(Duration::from_secs(25)))
        .map_err(|error| error.to_string())?;
    socket
        .set_write_timeout(Some(Duration::from_secs(25)))
        .map_err(|error| error.to_string())?;

    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    let server_name = ServerName::try_from(IMAP_HOST.to_string())
        .map_err(|error| format!("IMAP TLS 主机名错误: {error}"))?;
    let connection = ClientConnection::new(Arc::new(config), server_name)
        .map_err(|error| format!("IMAP TLS 初始化失败: {error}"))?;
    let mut stream = StreamOwned::new(connection, socket);
    read_greeting(&mut stream)?;

    let xoauth = BASE64.encode(format!(
        "user={}\x01auth=Bearer {}\x01\x01",
        account.email, access_token
    ));
    send_imap_command(
        &mut stream,
        "A001",
        &format!("AUTHENTICATE XOAUTH2 {xoauth}"),
    )?;
    let mailbox_name = if folder == "spam" { "Junk" } else { "INBOX" };
    send_imap_command(&mut stream, "A002", &format!("SELECT \"{mailbox_name}\""))?;
    let search = send_imap_command(&mut stream, "A003", "UID SEARCH ALL")?;
    let uids = parse_search_uids(&search);
    let total = uids.len();
    let mut messages = Vec::new();

    for (index, uid) in recent_uids_page(&uids, offset, limit).iter().enumerate() {
        let tag = format!("F{:04}", index + 1);
        let response = send_imap_command(
            &mut stream,
            &tag,
            &format!("UID FETCH {uid} (UID BODY.PEEK[])"),
        )?;
        let raw = extract_imap_literal(&response)?;
        messages.push(parse_raw_message(&raw, *uid, folder)?);
    }

    let _ = send_imap_command(&mut stream, "A999", "LOGOUT");
    Ok((total, messages))
}

async fn fetch_graph_messages(
    client: &Client,
    access_token: &str,
    folder: &str,
    limit: usize,
    offset: usize,
) -> Result<(usize, Vec<MailMessage>), String> {
    let (folder_key, graph_folder) = normalized_folder(folder);
    let safe_limit = limit.clamp(1, 100);
    let url = format!("{GRAPH_API_BASE}/me/mailFolders/{graph_folder}/messages");
    let response = client
        .get(url)
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("ConsistencyLevel", "eventual")
        .header("Prefer", "outlook.body-content-type=\"html\"")
        .query(&[
            ("$top", safe_limit.to_string()),
            ("$skip", offset.to_string()),
            ("$count", "true".to_string()),
            ("$orderby", "receivedDateTime desc".to_string()),
            (
                "$select",
                "id,subject,sender,receivedDateTime,bodyPreview,body".to_string(),
            ),
        ])
        .send()
        .await
        .map_err(|error| format!("Graph 请求失败: {error}"))?;
    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|error| format!("Graph 响应读取失败: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "Graph API 请求失败 (HTTP {}): {}",
            status.as_u16(),
            parse_remote_error(&response_text, "Microsoft Graph 返回空错误")
        ));
    }
    let payload: GraphListResponse = serde_json::from_str(&response_text)
        .map_err(|error| format!("Graph 响应格式错误: {error}"))?;
    let returned_count = payload.value.len();
    let total = payload
        .total
        .unwrap_or_else(|| offset + returned_count + usize::from(returned_count == safe_limit));
    let messages = payload
        .value
        .into_iter()
        .map(|message| {
            let body = message.body.unwrap_or(GraphBody {
                content_type: "text".to_string(),
                content: message.body_preview.clone(),
            });
            let body_type = if body.content_type.eq_ignore_ascii_case("html") {
                "html".to_string()
            } else {
                "text".to_string()
            };
            let sender = message
                .sender
                .map(|value| {
                    if value.email_address.name.is_empty() {
                        value.email_address.address
                    } else if value.email_address.address.is_empty() {
                        value.email_address.name
                    } else {
                        format!(
                            "{} <{}>",
                            value.email_address.name, value.email_address.address
                        )
                    }
                })
                .unwrap_or_else(|| "未知发件人".to_string());
            MailMessage {
                id: message.id,
                protocol: "graph".to_string(),
                folder: folder_key.to_string(),
                subject: if message.subject.is_empty() {
                    "(无主题)".to_string()
                } else {
                    message.subject
                },
                sender,
                received_at: message.received_date_time,
                preview: if message.body_preview.is_empty() {
                    body_preview(&body.content, &body_type)
                } else {
                    compact_text(&message.body_preview)
                },
                body: body.content,
                body_type,
            }
        })
        .collect();
    Ok((total, messages))
}

#[tauri::command]
pub async fn fetch_mailbox(request: FetchMailboxRequest) -> Result<MailboxResult, String> {
    let protocol = request.protocol.trim().to_lowercase();
    if protocol != "imap" && protocol != "graph" {
        return Err("协议仅支持 imap 或 graph".to_string());
    }
    if request.account.email.trim().is_empty()
        || request.account.client_id.trim().is_empty()
        || request.account.refresh_token.trim().is_empty()
    {
        return Err("账号、Client ID 和 Refresh Token 为必填项".to_string());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|error| error.to_string())?;
    let scope = if protocol == "graph" {
        GRAPH_SCOPE
    } else {
        IMAP_SCOPE
    };
    let (access_token, refresh_token) =
        refresh_access_token(&client, &request.account, scope).await?;
    let (folder_key, _) = normalized_folder(&request.folder);
    let safe_limit = request.limit.clamp(1, 100);
    let (total, messages) = if protocol == "graph" {
        fetch_graph_messages(
            &client,
            &access_token,
            folder_key,
            safe_limit,
            request.offset,
        )
        .await?
    } else {
        let account = request.account.clone();
        let access_token = access_token.clone();
        let folder = folder_key.to_string();
        tokio::task::spawn_blocking(move || {
            fetch_imap_messages(&account, &access_token, &folder, safe_limit, request.offset)
        })
        .await
        .map_err(|error| format!("IMAP 任务异常: {error}"))??
    };

    Ok(MailboxResult {
        account_id: request.account.id,
        email: request.account.email,
        protocol,
        total,
        messages,
        refresh_token,
    })
}

#[tauri::command]
pub fn health_check() -> &'static str {
    "ok"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_text_mail() {
        let raw = concat!(
            "From: Sender <sender@example.com>\r\n",
            "Subject: Your verification code 482913\r\n",
            "Date: Fri, 18 Jul 2026 12:00:00 +0000\r\n",
            "Content-Type: text/plain; charset=utf-8\r\n",
            "\r\n",
            "Use 482913 to finish signing in."
        );
        let message = parse_raw_message(raw.as_bytes(), 42, "inbox").unwrap();
        assert_eq!(message.id, "42");
        assert_eq!(message.protocol, "imap");
        assert!(message.subject.contains("482913"));
        assert!(message.body.contains("finish signing in"));
        assert_eq!(message.body_type, "text");
    }

    #[test]
    fn extracts_imap_literal_by_declared_length() {
        let raw = b"Subject: Test\r\n\r\nHello";
        let response = [
            format!("* 1 FETCH (BODY[] {{{}}}\r\n", raw.len()).into_bytes(),
            raw.to_vec(),
            b"\r\n)\r\nF0001 OK FETCH completed\r\n".to_vec(),
        ]
        .concat();
        assert_eq!(extract_imap_literal(&response).unwrap(), raw);
    }

    #[test]
    fn maps_junk_aliases_to_graph_folder() {
        assert_eq!(normalized_folder("junk"), ("spam", "junkemail"));
        assert_eq!(normalized_folder("inbox"), ("inbox", "inbox"));
    }

    #[test]
    fn paginates_imap_uids_from_newest_to_oldest() {
        let uids = vec![1, 2, 3, 4, 5, 6];
        assert_eq!(recent_uids_page(&uids, 0, 2), vec![6, 5]);
        assert_eq!(recent_uids_page(&uids, 2, 2), vec![4, 3]);
        assert_eq!(recent_uids_page(&uids, 4, 10), vec![2, 1]);
    }

    #[test]
    fn parses_graph_total_count() {
        let payload: GraphListResponse =
            serde_json::from_str(r#"{"@odata.count":42,"value":[]}"#).unwrap();
        assert_eq!(payload.total, Some(42));
    }

    #[test]
    fn installs_ring_crypto_provider_for_tls_clients() {
        install_crypto_provider();
        let mut roots = RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let _config = ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
    }

    #[test]
    fn extracts_nested_graph_error_message() {
        let message = parse_remote_error(
            r#"{"error":{"code":"ErrorAccessDenied","message":"Access is denied."}}"#,
            "fallback",
        );
        assert_eq!(message, "ErrorAccessDenied: Access is denied.");
    }
}
