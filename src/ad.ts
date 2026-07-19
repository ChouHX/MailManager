import { invoke } from "@tauri-apps/api/core";

export type AdSlotConfig = {
  enabled: boolean;
  title: string;
  description: string;
  image_url: string;
  image_alt: string;
  primary_action: {
    label: string;
    href: string;
  };
};

export async function fetchSiteAdConfig() {
  return await invoke<AdSlotConfig>("fetch_ad_config");
}
