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
    <section className="flex min-h-46 items-center gap-9 overflow-hidden rounded-lg border border-line bg-muted px-8 py-3">
      {/* Icon instead of a remote image: nothing to fail to load. */}
      <span className="grid size-34 shrink-0 place-items-center rounded-sm border border-line bg-surface text-primary">
        <MegaphoneIcon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-base tracking-tight">
          {config.title}
        </strong>
        <p className="mt-3 truncate text-xs text-soft">{config.description}</p>
      </div>
      {action.label && action.href ? (
        <Button
          small
          variant="accent"
          className="shrink-0 rounded-full"
          onClick={() => void openUrl(resolveSiteUrl(action.href))}
        >
          <GemIcon size={13} />
          {action.label}
        </Button>
      ) : null}
    </section>
  );
}
