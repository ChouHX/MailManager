import {
  DEFAULT_VERIFICATION_PATTERN,
  type MailAccount,
  type MailFolder,
  type MailProtocol,
} from "./mail";

const ACCOUNT_KEY = "ccmtc-mail-accounts-v1";
const SETTINGS_KEY = "ccmtc-mail-settings-v1";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const MIN_THREADS = 1;
export const MAX_THREADS = 30;

export type Settings = {
  protocols: MailProtocol[];
  folder: MailFolder;
  threadCount: number;
  verificationPattern: string;
  batchPageSize: number;
  singlePageSize: number;
  theme: "light" | "dark";
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readPageSize(value: unknown, fallback: number) {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : fallback;
}

export function clampThreads(value: unknown) {
  return Math.max(MIN_THREADS, Math.min(MAX_THREADS, Number(value) || 5));
}

export function readAccounts() {
  const value = readJson<MailAccount[]>(ACCOUNT_KEY, []);
  return Array.isArray(value) ? value : [];
}

export function writeAccounts(accounts: MailAccount[]) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
}

export function readSettings(): Settings {
  const stored = readJson<Partial<Settings>>(SETTINGS_KEY, {});
  const protocols = (stored.protocols || []).filter(
    (protocol): protocol is MailProtocol =>
      protocol === "imap" || protocol === "graph",
  );
  return {
    protocols: protocols.length ? protocols : ["imap", "graph"],
    folder: stored.folder === "spam" ? "spam" : "inbox",
    threadCount: clampThreads(stored.threadCount),
    verificationPattern:
      typeof stored.verificationPattern === "string"
        ? stored.verificationPattern
        : DEFAULT_VERIFICATION_PATTERN,
    batchPageSize: readPageSize(stored.batchPageSize, 10),
    singlePageSize: readPageSize(stored.singlePageSize, 20),
    theme:
      stored.theme === "dark" || stored.theme === "light"
        ? stored.theme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
  };
}

export function writeSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
