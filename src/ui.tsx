import {
  ArchiveIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InboxIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import type { MailFolder, MailProtocol } from "./mail";
import { PAGE_SIZE_OPTIONS } from "./settings";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

// Colours come from the semantic tokens in styles.css (`--color-*`), so light
// and dark are one definition each and nothing here hardcodes a palette.
const BUTTON_VARIANTS = {
  // 主按钮：主色微渐变，克制的高光边框与轻量阴影
  primary:
    "border-primary/30 bg-linear-to-b from-primary to-primary-strong text-white shadow-key enabled:hover:brightness-105",

  // 强调按钮：淡主色底配主色文字
  accent:
    "border-primary/30 bg-primary-soft text-primary enabled:hover:border-primary/50",

  // 辅助/默认按钮：卡片质感，中性边框
  soft: "border-line bg-surface text-ink shadow-sm enabled:hover:bg-hover",

  // 幽灵按钮：低调中性灰
  ghost: "border-transparent text-soft enabled:hover:bg-hover",
} as const;

const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-primary/30";
const INTERACTIVE =
  "cursor-pointer transition-all duration-150 outline-none select-none enabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  variant = "soft",
  small,
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  small?: boolean;
}) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-6 border font-medium",
        INTERACTIVE,
        FOCUS_RING,
        "focus-visible:ring-offset-1",
        small
          ? "min-h-28 rounded px-8 text-xs"
          : "min-h-34 rounded-md px-12 text-sm",
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

export function IconButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex size-34 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-soft shadow-sm",
        INTERACTIVE,
        FOCUS_RING,
        "enabled:hover:bg-hover enabled:hover:text-ink",
        className,
      )}
    />
  );
}

function Chip({
  active,
  className,
  ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex h-28 items-center gap-5 rounded border px-8 text-xs font-medium",
        INTERACTIVE,
        active
          ? "border-primary/40 bg-primary-soft text-primary shadow-xs"
          : "border-line bg-surface text-soft hover:bg-hover hover:text-ink",
        className,
      )}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  size = "md",
  label,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  size?: "md" | "sm";
  label?: string;
  onChange: (value: T) => void;
}) {
  return (
    <div
      aria-label={label}
      className="inline-flex gap-1 rounded-md border border-line bg-muted p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            "inline-flex cursor-pointer items-center justify-center gap-5 rounded font-medium transition-all duration-150 outline-none",
            size === "md" ? "h-28 px-10 text-xs" : "h-24 px-8 text-xs",
            option.value === value
              ? "bg-surface text-ink shadow-tab"
              : "text-soft hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const PILL =
  "inline-flex h-26 items-center gap-4 rounded border border-primary/30 bg-primary-soft/80 px-8 font-mono text-xs font-semibold tracking-wider text-primary";

/** Verification code chip. Renders a button only when it can be copied, so it
 *  stays valid markup inside the clickable message rows. */
export function CodePill({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: ComponentProps<"button">["onClick"];
}) {
  return onClick ? (
    <button
      className={cx(
        PILL,
        "cursor-pointer transition-colors hover:border-primary/50 hover:bg-primary-soft active:translate-y-px",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  ) : (
    <span className={PILL}>{children}</span>
  );
}

export function Avatar({ email }: { email: string }) {
  return (
    <span className="grid size-28 shrink-0 place-items-center rounded-md border border-line bg-muted text-xs font-semibold text-soft">
      {email.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ProtocolBadge({ protocol }: { protocol: MailProtocol }) {
  return (
    <span
      className={cx(
        "inline-flex w-fit items-center rounded-sm border px-6 py-1 text-2xs font-semibold tracking-wider uppercase",
        // The two protocol hues are the only literal colours left in the kit:
        // they are identity, not theme, so they do not follow the tokens.
        protocol === "graph"
          ? "border-[#c7c9f2] bg-[#eeefff] text-[#5a61c9] dark:border-[#3b4180] dark:bg-[#292f55] dark:text-[#a9b0ff]"
          : "border-[#b6ded1] bg-[#e9f7f2] text-[#347b68] dark:border-[#2c5c4c] dark:bg-[#1b3c33] dark:text-[#79d3b7]",
      )}
    >
      {protocol === "graph" ? "Graph" : "IMAP"}
    </span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-2xs font-bold tracking-widest text-primary uppercase">
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-200 flex-col items-center justify-center gap-6 text-center text-faint">
      <div className="grid size-42 place-items-center rounded-xl border border-line bg-muted text-soft">
        <Icon size={20} />
      </div>
      <strong className="text-sm font-semibold text-soft">{title}</strong>
      <span className="max-w-260 text-xs text-faint">{description}</span>
    </div>
  );
}

export function Dialog({
  heading,
  className,
  onClose,
  children,
}: {
  heading: ReactNode;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-[#0b101c]/55 p-16"
      onMouseDown={onClose}
    >
      <section
        onMouseDown={(event) => event.stopPropagation()}
        className={cx(
          "flex max-h-[min(88vh,720px)] w-[min(94vw,640px)] animate-dialog-in flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-dialog",
          className,
        )}
      >
        <header className="flex min-h-64 shrink-0 items-start justify-between gap-12 border-b border-line px-14 py-12">
          <div className="min-w-0">{heading}</div>
          <IconButton onClick={onClose} aria-label="关闭">
            <XIcon size={16} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}

export function DialogHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-1.5 truncate text-lg font-semibold tracking-tight text-ink">
        {title}
      </h2>
      <p className="mt-1 text-xs text-faint">{description}</p>
    </>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="-mx-14 -mb-12 mt-12 flex justify-end gap-6 border-t border-line bg-muted/50 px-14 py-10">
      {children}
    </footer>
  );
}

export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mt-10 mb-4 block text-xs font-semibold text-soft"
    >
      {children}
    </label>
  );
}

export const TEXTAREA_CLASS =
  "resize-y rounded-lg border border-line bg-muted/50 p-10 font-mono text-xs leading-relaxed text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

export function Pager({
  page,
  totalPages,
  total,
  pageSize,
  disabled = false,
  compact = false,
  onChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize?: number;
  disabled?: boolean;
  /** Drops the page-size select and tightens spacing, for narrow columns. */
  compact?: boolean;
  onChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  return (
    <div
      className={cx(
        "flex shrink-0 items-center justify-between border-t border-line text-xs text-faint",
        compact ? "min-h-34 px-8 py-4" : "min-h-40 py-4 pr-8 pl-12",
      )}
    >
      <span>
        {compact
          ? `${page} / ${totalPages} 页 · ${total}`
          : `第 ${page} / ${totalPages} 页 · 共 ${total} 条`}
      </span>
      <div className="flex items-center gap-4">
        {!compact && pageSize && onPageSizeChange ? (
          <label className="inline-flex h-28 items-center gap-4 rounded border border-line bg-surface pr-4 pl-6">
            <span className="text-2xs text-faint">每页</span>
            <select
              value={pageSize}
              disabled={disabled}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-20 rounded bg-muted px-2 text-xs text-ink outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <IconButton
          className={cx("rounded", compact ? "size-24" : "size-28")}
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeftIcon size={compact ? 13 : 15} />
        </IconButton>
        <IconButton
          className={cx("rounded", compact ? "size-24" : "size-28")}
          disabled={disabled || page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="下一页"
        >
          <ChevronRightIcon size={compact ? 13 : 15} />
        </IconButton>
      </div>
    </div>
  );
}

function ControlLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mr-1.5 text-2xs font-semibold tracking-wider text-faint uppercase max-[900px]:hidden">
      {children}
    </span>
  );
}

const PROTOCOLS: MailProtocol[] = ["imap", "graph"];

export function FetchToolbar({
  protocols,
  folder,
  accountCount,
  bare = false,
  onToggleProtocol,
  onFolderChange,
  children,
}: {
  protocols: MailProtocol[];
  folder: MailFolder;
  accountCount?: number;
  bare?: boolean;
  onToggleProtocol: (protocol: MailProtocol) => void;
  onFolderChange: (folder: MailFolder) => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex min-w-0 items-center gap-6",
        bare
          ? "shrink-0"
          : "w-full flex-wrap rounded-lg border border-line bg-muted/70 p-4",
      )}
    >
      <div className="flex items-center gap-4">
        <ControlLabel>取件协议</ControlLabel>
        {PROTOCOLS.map((protocol) => (
          <Chip
            key={protocol}
            active={protocols.includes(protocol)}
            onClick={() => onToggleProtocol(protocol)}
          >
            {protocols.includes(protocol) ? (
              <CheckCircle2Icon size={13} />
            ) : null}
            {protocol === "graph" ? "Graph" : "IMAP"}
          </Chip>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <ControlLabel>文件夹</ControlLabel>
        <Segmented
          size="sm"
          value={folder}
          onChange={onFolderChange}
          options={[
            {
              value: "inbox",
              label: (
                <>
                  <InboxIcon size={12} />
                  收件箱
                </>
              ),
            },
            {
              value: "spam",
              label: (
                <>
                  <ArchiveIcon size={12} />
                  垃圾箱
                </>
              ),
            },
          ]}
        />
      </div>

      {typeof accountCount === "number" ? (
        <div className="flex shrink-0 items-center gap-4 text-xs font-medium text-faint">
          <UsersIcon size={14} />
          {accountCount} 个账号
        </div>
      ) : null}

      {children ? (
        <div
          className={cx("flex min-w-0 items-center gap-6", !bare && "ml-auto")}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
