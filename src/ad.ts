import { invoke } from "@tauri-apps/api/core";

export type AdSlotConfig = {
  enabled: boolean;
  title: string;
  description: string;
  primary_action: {
    label: string;
    href: string;
  };
};

/** 与 Rust 端内置广告保持一致，接口不可用时仍然展示。 */
export const BUILTIN_AD_SLOT: AdSlotConfig = {
  enabled: true,
  title: "HShop",
  description: "微软邮箱、TikTok、Gmail批发，一个也是批发价",
  primary_action: {
    label: "购买",
    href: "https://opcuu.com/redeem",
  },
};

export async function fetchSiteAdConfig(): Promise<AdSlotConfig> {
  try {
    return await invoke<AdSlotConfig>("fetch_ad_config");
  } catch (error) {
    console.warn("站点广告获取失败，使用内置广告", error);
    return BUILTIN_AD_SLOT;
  }
}
