use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const SITE_AD_URL: &str = "https://ccmtc.cfd/api/ui/ads";

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct AdAction {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub href: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct AdSlotConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub image_url: String,
    #[serde(default)]
    pub image_alt: String,
    #[serde(default)]
    pub primary_action: AdAction,
}

#[derive(Debug, Deserialize)]
struct ApiEnvelope {
    success: bool,
    data: Option<AdSlotConfig>,
    #[serde(default)]
    message: String,
}

#[tauri::command]
pub async fn fetch_ad_config() -> Result<AdSlotConfig, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| format!("广告客户端初始化失败: {error}"))?;
    let response = client
        .get(SITE_AD_URL)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| format!("站点广告请求失败: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("站点广告响应读取失败: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "站点广告请求失败 (HTTP {}): {body}",
            status.as_u16()
        ));
    }
    let envelope: ApiEnvelope =
        serde_json::from_str(&body).map_err(|error| format!("站点广告格式错误: {error}"))?;
    if !envelope.success {
        return Err(if envelope.message.is_empty() {
            "站点未返回广告配置".to_string()
        } else {
            envelope.message
        });
    }
    envelope.data.ok_or_else(|| "站点广告配置为空".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_site_ad_envelope() {
        let value: ApiEnvelope = serde_json::from_str(
            r#"{"success":true,"data":{"enabled":true,"title":"Title","description":"Desc","image_url":"/ad.png","primary_action":{"label":"Go","href":"https://example.com"}}}"#,
        )
        .unwrap();
        assert!(value.success);
        assert_eq!(value.data.unwrap().title, "Title");
    }
}
