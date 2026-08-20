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

export async function fetchSiteAdConfig() {
  return await invoke<AdSlotConfig>("fetch_ad_config");
}
