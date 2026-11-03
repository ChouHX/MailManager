use crate::mail::http_client;
use serde::{Deserialize, Serialize};

const SITE_AD_URL: &str = "https://ccmtc.cfd/api/ui/ads";

/// 内置广告：站点接口不可用或返回空配置时使用，保证头部广告位始终有内容。
pub const BUILTIN_AD_TITLE: &str = "HShop";
pub const BUILTIN_AD_DESCRIPTION: &str = "微软邮箱、TikTok、Gmail批发，一个也是批发价";
pub const BUILTIN_AD_ACTION_LABEL: &str = "购买";
pub const BUILTIN_AD_HREF: &str = "https://opcuu.com/redeem";

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
    pub primary_action: AdAction,
}

/// 站点 `/api/ui/ads` 单个广告位（多广告位数组的元素）。
#[derive(Debug, Clone, Default, Deserialize)]
struct AdSlotItem {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    primary_action: AdAction,
}

/// 兼容两种返回结构：旧版扁平字段，以及新版 `slots` 数组。
#[derive(Debug, Default, Deserialize)]
struct AdPayload {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    primary_action: AdAction,
    #[serde(default)]
    slots: Vec<AdSlotItem>,
}

#[derive(Debug, Deserialize)]
struct ApiEnvelope {
    success: bool,
    data: Option<AdPayload>,
    #[serde(default)]
    message: String,
}

/// 内置广告配置，字段与站点接口返回的结构保持一致。
pub fn builtin_ad_config() -> AdSlotConfig {
    AdSlotConfig {
        enabled: true,
        title: BUILTIN_AD_TITLE.to_string(),
        description: BUILTIN_AD_DESCRIPTION.to_string(),
        primary_action: AdAction {
            label: BUILTIN_AD_ACTION_LABEL.to_string(),
            href: BUILTIN_AD_HREF.to_string(),
        },
    }
}

impl AdPayload {
    /// 优先取第一个可用的广告位；否则回退到旧版扁平字段；都没有则视为无广告。
    fn into_config(self) -> Option<AdSlotConfig> {
        if let Some(slot) = self
            .slots
            .into_iter()
            .find(|slot| slot.enabled && !slot.title.trim().is_empty())
        {
            return Some(AdSlotConfig {
                enabled: true,
                title: slot.title,
                description: slot.description,
                primary_action: slot.primary_action,
            });
        }
        if !self.title.trim().is_empty() {
            return Some(AdSlotConfig {
                enabled: self.enabled,
                title: self.title,
                description: self.description,
                primary_action: self.primary_action,
            });
        }
        None
    }
}

async fn fetch_remote_ad_config() -> Result<AdSlotConfig, String> {
    let response = http_client()
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
    envelope
        .data
        .and_then(AdPayload::into_config)
        .ok_or_else(|| "站点广告配置为空".to_string())
}

/// 读取站点广告配置；任何失败都退回内置广告，界面上不会出现空广告位。
#[tauri::command]
pub async fn fetch_ad_config() -> Result<AdSlotConfig, String> {
    match fetch_remote_ad_config().await {
        Ok(config) => Ok(config),
        Err(error) => {
            eprintln!("站点广告不可用，使用内置广告: {error}");
            Ok(builtin_ad_config())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_site_ad_envelope_with_slots() {
        let value: ApiEnvelope = serde_json::from_str(
            r##"{"success":true,"message":"ok","data":{"enabled":true,"slots":[
                {"enabled":false,"title":"合作渠道推荐","description":"略","image_url":"","primary_action":{"label":"查看详情","href":"#"}},
                {"enabled":true,"title":"HShop","description":"微软邮箱、TikTok、Gmail批发，一个也是批发价","image_url":"https://opcuu.com/favicon.svg","primary_action":{"label":"购买","href":"https://opcuu.com/redeem"}}
            ]}}"##,
        )
        .unwrap();
        assert!(value.success);
        let config = value.data.unwrap().into_config().unwrap();
        assert!(config.enabled);
        assert_eq!(config.title, "HShop");
        assert_eq!(config.description, BUILTIN_AD_DESCRIPTION);
        assert_eq!(config.primary_action.label, "购买");
        assert_eq!(config.primary_action.href, BUILTIN_AD_HREF);
    }

    #[test]
    fn parses_legacy_flat_envelope() {
        let value: ApiEnvelope = serde_json::from_str(
            r#"{"success":true,"data":{"enabled":true,"title":"Title","description":"Desc","image_url":"/ad.png","primary_action":{"label":"Go","href":"https://example.com"}}}"#,
        )
        .unwrap();
        let config = value.data.unwrap().into_config().unwrap();
        assert_eq!(config.title, "Title");
        assert_eq!(config.primary_action.href, "https://example.com");
    }

    #[test]
    fn empty_payload_has_no_config() {
        let value: ApiEnvelope = serde_json::from_str(r#"{"success":true,"data":{"enabled":true}}"#)
            .unwrap();
        assert!(value.data.unwrap().into_config().is_none());
    }

    #[test]
    fn builtin_ad_matches_requested_copy() {
        let config = builtin_ad_config();
        assert!(config.enabled);
        assert_eq!(config.title, "HShop");
        assert_eq!(config.description, "微软邮箱、TikTok、Gmail批发，一个也是批发价");
        assert_eq!(config.primary_action.label, "购买");
        assert_eq!(config.primary_action.href, "https://opcuu.com/redeem");
    }
}
