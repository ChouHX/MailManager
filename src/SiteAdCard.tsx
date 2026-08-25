import { GemIcon, MegaphoneIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

import type { AdSlotConfig } from "./ad";
import { Button } from "./ui";

const SITE_ORIGIN = "https://ccmtc.cfd";

function resolveSiteUrl(value: string) {
  const source = value.trim();
  if (!source) return "";
  try {
    return new URL(source, SITE_ORIGIN).toString();
  } catch {
    return source;
  }
}

export function SiteAdCard({ config }: { config: AdSlotConfig }) {
  if (!config.enabled) {
    return null;
  }
  const action = config.primary_action;

  return (
    <div className="ad-rainbow-frame h-42 rounded-lg">
      <section className="ad-rainbow-panel flex h-full items-center gap-8 overflow-hidden rounded-[4px] px-7 py-2 shadow-[0_2px_10px_rgb(15_23_42/0.12)]">
        {/* Icon instead of a remote image: nothing to fail to load. */}
        <span className="grid size-30 shrink-0 place-items-center rounded-sm border border-primary bg-primary text-white shadow-key">
          <MegaphoneIcon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-6">
            <span className="shrink-0 rounded-xs bg-primary/12 px-5 py-1 text-2xs font-bold tracking-wider text-primary uppercase">
              推荐
            </span>
            <strong className="truncate text-base font-semibold tracking-tight">
              {config.title}
            </strong>
          </div>
          <p className="mt-1 truncate text-xs text-soft">{config.description}</p>
        </div>
        {action.label && action.href ? (
          <Button
            small
            variant="primary"
            className="shrink-0 rounded-sm"
            onClick={() => void openUrl(resolveSiteUrl(action.href))}
          >
            <GemIcon size={13} />
            {action.label}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
