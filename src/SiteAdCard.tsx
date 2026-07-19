import { GemIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

import type { AdSlotConfig } from "./ad";

const SITE_ORIGIN = "https://ccmtc.cfd";

function resolveSiteAsset(value: string) {
  const source = value.trim();
  if (!source) return "";
  try {
    return new URL(source, SITE_ORIGIN).toString();
  } catch {
    return source;
  }
}

export function SiteAdCard({
  config,
  compact = false,
}: {
  config: AdSlotConfig;
  compact?: boolean;
}) {
  if (!config.enabled) {
    return null;
  }
  const imageUrl = resolveSiteAsset(config.image_url);
  const action = config.primary_action;

  return (
    <section className={`site-ad-card ${compact ? "site-ad-compact" : ""}`}>
      <div className="site-ad-background" aria-hidden="true">
        <div className="site-ad-glow site-ad-glow-left" />
        <div className="site-ad-glow site-ad-glow-right" />
      </div>
      <div className="site-ad-scan-host" aria-hidden="true">
        <div className="site-ad-scan" />
      </div>
      {imageUrl ? (
        <div className="site-ad-image">
          <img
            src={imageUrl}
            alt={config.image_alt || config.title}
            loading="lazy"
          />
        </div>
      ) : null}
      <div className="site-ad-copy">
        <strong>{config.title}</strong>
        <div className="site-ad-marquee">
          <div className="site-ad-marquee-track">
            <p>{config.description}</p>
            <p aria-hidden="true">{config.description}</p>
          </div>
        </div>
      </div>
      {action?.label && action?.href ? (
        <div className="site-ad-action-wrap">
          <span className="site-ad-action-border" aria-hidden="true" />
          <button
            className="site-ad-action"
            onClick={() => void openUrl(resolveSiteAsset(action.href))}
          >
            <GemIcon size={13} />
            {action.label}
          </button>
        </div>
      ) : null}
      <div className="site-ad-bottom-line" aria-hidden="true" />
    </section>
  );
}
