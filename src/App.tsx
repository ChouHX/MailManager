import {
  ArchiveIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CopyIcon,
  FileTextIcon,
  InboxIcon,
  LayoutListIcon,
  LoaderCircleIcon,
  MailIcon,
  MoonIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SunIcon,
  TablePropertiesIcon,
  Trash2Icon,
  UploadIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { fetchSiteAdConfig, type AdSlotConfig } from "./ad";
import {
  type AccountFetchResult,
  type BatchRow,
  type MailAccount,
  type MailFolder,
  type MailMessage,
  type MailProtocol,
  DEFAULT_VERIFICATION_PATTERN,
  errorMessage,
  extractVerificationCode,
  fetchAccount,
  formatDateTime,
  parseAccountText,
  runWithConcurrency,
} from "./mail";
import { SiteAdCard } from "./SiteAdCard";
import siteLogo from "../src-tauri/icons/128x128.png";

const ACCOUNT_STORAGE_KEY = "ccmtc-mail-accounts-v1";
const SETTINGS_STORAGE_KEY = "ccmtc-mail-settings-v1";
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const DEFAULT_BATCH_PAGE_SIZE = 10;
const DEFAULT_SINGLE_PAGE_SIZE = 20;

type Mode = "batch" | "single";
type ThemeMode = "light" | "dark";

type StoredSettings = {
  protocols: MailProtocol[];
  folder: MailFolder;
  threadCount: number;
  verificationPattern: string;
  batchPageSize: number;
  singlePageSize: number;
  theme: ThemeMode;
};

function normalizePageSize(value: unknown, fallback: number) {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(
    parsed as (typeof PAGE_SIZE_OPTIONS)[number],
  )
    ? parsed
    : fallback;
}

function readAccounts() {
  try {
    const value = JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? (value as MailAccount[]) : [];
  } catch {
    return [];
  }
}

function readSettings(): StoredSettings {
  try {
    const value = JSON.parse(
      localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}",
    ) as Partial<StoredSettings>;
    return {
      protocols: value.protocols?.filter(
        (protocol): protocol is MailProtocol =>
          protocol === "imap" || protocol === "graph",
      ) || ["imap", "graph"],
      folder: value.folder === "spam" ? "spam" : "inbox",
      threadCount: Math.max(1, Math.min(30, Number(value.threadCount) || 5)),
      verificationPattern:
        typeof value.verificationPattern === "string"
          ? value.verificationPattern
          : DEFAULT_VERIFICATION_PATTERN,
      batchPageSize: normalizePageSize(
        value.batchPageSize,
        DEFAULT_BATCH_PAGE_SIZE,
      ),
      singlePageSize: normalizePageSize(
        value.singlePageSize,
        DEFAULT_SINGLE_PAGE_SIZE,
      ),
      theme:
        value.theme === "dark" || value.theme === "light"
          ? value.theme
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light",
    };
  } catch {
    return {
      protocols: ["imap", "graph"],
      folder: "inbox",
      threadCount: 5,
      verificationPattern: DEFAULT_VERIFICATION_PATTERN,
      batchPageSize: DEFAULT_BATCH_PAGE_SIZE,
      singlePageSize: DEFAULT_SINGLE_PAGE_SIZE,
      theme: "light",
    };
  }
}

function mergeAccounts(current: MailAccount[], incoming: MailAccount[]) {
  const values = new Map(current.map((account) => [account.id, account]));
  for (const account of incoming) {
    values.set(account.id, account);
  }
  return [...values.values()];
}

function messageKey(message: MailMessage) {
  return `${message.protocol}:${message.folder}:${message.id}`;
}

function ProtocolBadge({ protocol }: { protocol: MailProtocol }) {
  return (
    <span className={`protocol-badge protocol-${protocol}`}>
      {protocol === "graph" ? "Graph" : "IMAP"}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof InboxIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={22} />
      </div>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function Pager({
  page,
  totalPages,
  total,
  pageSize,
  disabled = false,
  onChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  disabled?: boolean;
  onChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  return (
    <div className="pager">
      <span>
        第 {page} / {totalPages} 页 · 共 {total} 条
      </span>
      <div className="pager-actions">
        <label className="page-size-field">
          <span>每页</span>
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-button"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeftIcon size={16} />
        </button>
        <button
          className="icon-button"
          disabled={disabled || page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="下一页"
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>
    </div>
  );
}

function FetchToolbar({
  protocols,
  folder,
  accountCount,
  onToggleProtocol,
  onFolderChange,
  children,
}: {
  protocols: MailProtocol[];
  folder: MailFolder;
  accountCount?: number;
  onToggleProtocol: (protocol: MailProtocol) => void;
  onFolderChange: (folder: MailFolder) => void;
  children?: ReactNode;
}) {
  return (
    <div className="embedded-controls">
      <div className="control-group">
        <span className="control-label">取件协议</span>
        <button
          className={`choice-chip ${protocols.includes("imap") ? "active" : ""}`}
          onClick={() => onToggleProtocol("imap")}
        >
          {protocols.includes("imap") ? <CheckCircle2Icon size={14} /> : null}
          IMAP
        </button>
        <button
          className={`choice-chip ${protocols.includes("graph") ? "active" : ""}`}
          onClick={() => onToggleProtocol("graph")}
        >
          {protocols.includes("graph") ? <CheckCircle2Icon size={14} /> : null}
          Graph
        </button>
      </div>

      <div className="control-group">
        <span className="control-label">文件夹</span>
        <div className="mini-switch">
          <button
            className={folder === "inbox" ? "active" : ""}
            onClick={() => onFolderChange("inbox")}
          >
            <InboxIcon size={13} />
            收件箱
          </button>
          <button
            className={folder === "spam" ? "active" : ""}
            onClick={() => onFolderChange("spam")}
          >
            <ArchiveIcon size={13} />
            垃圾箱
          </button>
        </div>
      </div>

      {typeof accountCount === "number" ? (
        <div className="account-count">
          <UsersIcon size={15} />
          {accountCount} 个账号
        </div>
      ) : null}

      {children ? <div className="embedded-actions">{children}</div> : null}
    </div>
  );
}

function MessageDialog({
  context,
  verificationPattern,
  onClose,
}: {
  context: { account: MailAccount; message: MailMessage } | null;
  verificationPattern: string;
  onClose: () => void;
}) {
  if (!context) {
    return null;
  }
  const { account, message } = context;
  const code = extractVerificationCode(message, verificationPattern);
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
        className="dialog-card mail-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div className="dialog-heading">
            <div className="dialog-title-row">
              <ProtocolBadge protocol={message.protocol} />
              <span>{account.email}</span>
            </div>
            <h2>{message.subject || "(无主题)"}</h2>
            <p>
              {message.sender} · {formatDateTime(message.received_at)}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <XIcon size={18} />
          </button>
        </header>

        {code ? (
          <div className="verification-strip">
            <span>识别到验证码</span>
            <strong>{code}</strong>
            <button
              className="button button-soft button-small"
              onClick={() => {
                void navigator.clipboard.writeText(code);
                toast.success("验证码已复制");
              }}
            >
              <CopyIcon size={13} />
              复制
            </button>
          </div>
        ) : null}

        <div className="mail-body-host">
          {message.body_type === "html" ? (
            <iframe
              title="邮件正文"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={message.body}
            />
          ) : (
            <pre>{message.body || message.preview || "暂无正文内容"}</pre>
          )}
        </div>
      </section>
    </div>
  );
}

function ImportDialog({
  open,
  value,
  onValueChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  if (!open) {
    return null;
  }
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
        className="dialog-card import-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div className="dialog-heading">
            <span className="eyebrow">账号管理</span>
            <h2>手动导入 Outlook OAuth 账号</h2>
            <p>仅保存在当前电脑。支持 TXT 文件或直接粘贴文本。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <XIcon size={18} />
          </button>
        </header>
        <form onSubmit={onSubmit} className="import-form">
          <input
            ref={inputRef}
            hidden
            type="file"
            accept=".txt,text/plain"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              void file.text().then((text) => {
                onValueChange(text);
                toast.success(`已读取 ${file.name}`);
              });
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className="file-drop"
            onClick={() => inputRef.current?.click()}
          >
            <UploadIcon size={18} />
            <span>
              <strong>选择 TXT 文件</strong>
              <small>文件内容会载入下方文本框，可确认后再导入</small>
            </span>
          </button>
          <label className="field-label" htmlFor="account-import-text">
            账号文本
          </label>
          <textarea
            id="account-import-text"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            rows={12}
            spellCheck={false}
            placeholder="account@example.com----password----client_id----refresh_token"
          />
          <p className="form-hint">
            一行一个账号，格式：邮箱----密码----Client ID----Refresh Token
          </p>
          <footer className="dialog-footer">
            <button
              type="button"
              className="button button-soft"
              onClick={onClose}
            >
              取消
            </button>
            <button type="submit" className="button button-primary">
              <PlusIcon size={15} />
              导入账号
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function RegexDialog({
  open,
  value,
  onValueChange,
  onClose,
  onSave,
}: {
  open: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
        className="dialog-card regex-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div className="dialog-heading">
            <span className="eyebrow">Batch mailbox</span>
            <h2>验证码正则表达式</h2>
            <p>依次匹配邮件主题、摘要和正文，优先返回第一个捕获组。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <XIcon size={18} />
          </button>
        </header>
        <form className="regex-form" onSubmit={onSave}>
          <label className="field-label" htmlFor="verification-pattern">
            正则表达式
          </label>
          <textarea
            id="verification-pattern"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            rows={6}
            spellCheck={false}
          />
          <p className="form-hint">
            示例：{String.raw`验证码[^\d]{0,12}(\d{6})`}
          </p>
          <footer className="dialog-footer">
            <button
              type="button"
              className="button button-ghost regex-reset"
              onClick={() => onValueChange(DEFAULT_VERIFICATION_PATTERN)}
            >
              恢复默认
            </button>
            <button
              type="button"
              className="button button-soft"
              onClick={onClose}
            >
              取消
            </button>
            <button type="submit" className="button button-primary">
              保存正则
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default function App() {
  const initialSettings = useMemo(readSettings, []);
  const [accounts, setAccounts] = useState<MailAccount[]>(readAccounts);
  const [mode, setMode] = useState<Mode>("batch");
  const [protocols, setProtocols] = useState<MailProtocol[]>(
    initialSettings.protocols.length
      ? initialSettings.protocols
      : ["imap", "graph"],
  );
  const [folder, setFolder] = useState<MailFolder>(initialSettings.folder);
  const [threadCount, setThreadCount] = useState(initialSettings.threadCount);
  const [verificationPattern, setVerificationPattern] = useState(
    initialSettings.verificationPattern,
  );
  const [batchPageSize, setBatchPageSize] = useState(
    initialSettings.batchPageSize,
  );
  const [singlePageSize, setSinglePageSize] = useState(
    initialSettings.singlePageSize,
  );
  const [theme, setTheme] = useState<ThemeMode>(initialSettings.theme);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [regexOpen, setRegexOpen] = useState(false);
  const [regexDraft, setRegexDraft] = useState(verificationPattern);
  const [query, setQuery] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState(
    () => readAccounts()[0]?.id || "",
  );
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchPage, setBatchPage] = useState(1);
  const [singleResult, setSingleResult] = useState<AccountFetchResult | null>(
    null,
  );
  const [singleLoading, setSingleLoading] = useState(false);
  const [singlePage, setSinglePage] = useState(1);
  const [dialogContext, setDialogContext] = useState<{
    account: MailAccount;
    message: MailMessage;
  } | null>(null);
  const [adSlot, setAdSlot] = useState<AdSlotConfig | null>(null);

  useEffect(() => {
    void fetchSiteAdConfig()
      .then((config) => setAdSlot(config.enabled ? config : null))
      .catch(() => setAdSlot(null));
  }, []);

  useEffect(() => {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    setSelectedAccountId((current) =>
      accounts.some((account) => account.id === current)
        ? current
        : accounts[0]?.id || "",
    );
    setBatchRows((current) => {
      const existingRows = new Map(current.map((row) => [row.account.id, row]));
      return accounts.map((account) => {
        const existing = existingRows.get(account.id);
        if (existing) {
          return { ...existing, account };
        }
        return {
          account,
          message: null,
          verificationCode: "",
          errors: [],
          completed: false,
          successfulProtocolCount: 0,
        };
      });
    });
  }, [accounts]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        protocols,
        folder,
        threadCount,
        verificationPattern,
        batchPageSize,
        singlePageSize,
        theme,
      }),
    );
  }, [
    batchPageSize,
    folder,
    protocols,
    singlePageSize,
    theme,
    threadCount,
    verificationPattern,
  ]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) || null,
    [accounts, selectedAccountId],
  );
  const filteredAccounts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return accounts;
    return accounts.filter((account) =>
      account.email.toLowerCase().includes(keyword),
    );
  }, [accounts, query]);
  const batchTotalPages = Math.max(
    1,
    Math.ceil(batchRows.length / batchPageSize),
  );
  const visibleBatchRows = batchRows.slice(
    (batchPage - 1) * batchPageSize,
    batchPage * batchPageSize,
  );
  const singleMessages = singleResult?.messages || [];
  const singleTotal = singleResult?.total || 0;
  const singleTotalPages = Math.max(1, Math.ceil(singleTotal / singlePageSize));
  const visibleSingleMessages = singleMessages;

  useEffect(() => {
    setBatchPage((current) => Math.min(current, batchTotalPages));
  }, [batchTotalPages]);

  useEffect(() => {
    setSinglePage((current) => Math.min(current, singleTotalPages));
  }, [singleTotalPages]);

  function toggleProtocol(protocol: MailProtocol) {
    setProtocols((current) => {
      if (current.includes(protocol)) {
        if (current.length === 1) {
          toast.error("至少保留一个取件协议");
          return current;
        }
        return current.filter((value) => value !== protocol);
      }
      return [...current, protocol];
    });
  }

  function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAccountText(importText);
    if (!parsed.accounts.length) {
      toast.error("没有解析到有效账号", {
        description: "请检查邮箱----密码----Client ID----Refresh Token 格式。",
      });
      return;
    }
    setAccounts((current) => mergeAccounts(current, parsed.accounts));
    setSelectedAccountId(parsed.accounts[0].id);
    setBatchRows([]);
    setSingleResult(null);
    setImportText("");
    setImportOpen(false);
    toast.success(`已导入 ${parsed.accounts.length} 个账号`, {
      description: parsed.invalidLines.length
        ? `另有 ${parsed.invalidLines.length} 行格式错误，已跳过。`
        : "账号仅保存在当前电脑。",
    });
  }

  function handleRegexSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      new RegExp(regexDraft, "i");
    } catch (error) {
      toast.error("验证码正则表达式无效", {
        description: errorMessage(error),
      });
      return;
    }
    setVerificationPattern(regexDraft);
    setBatchRows((current) =>
      current.map((row) => ({
        ...row,
        verificationCode: extractVerificationCode(row.message, regexDraft),
      })),
    );
    setRegexOpen(false);
    toast.success("验证码正则已保存");
  }

  async function handleBatchFetch() {
    try {
      new RegExp(verificationPattern, "i");
    } catch (error) {
      toast.error("验证码正则表达式无效", {
        description: errorMessage(error),
      });
      return;
    }
    if (!accounts.length) {
      toast.error("请先导入账号");
      setImportOpen(true);
      return;
    }
    const pageStart = (batchPage - 1) * batchPageSize;
    const pageAccounts = accounts.slice(pageStart, pageStart + batchPageSize);
    if (!pageAccounts.length) {
      toast.info("当前页没有可读取的账号");
      return;
    }
    setBatchLoading(true);
    const pageAccountIds = new Set(pageAccounts.map((account) => account.id));
    setBatchRows((current) =>
      current.map((row) =>
        pageAccountIds.has(row.account.id)
          ? {
              ...row,
              message: null,
              verificationCode: "",
              errors: [],
              completed: false,
              successfulProtocolCount: 0,
            }
          : row,
      ),
    );
    try {
      const results = await runWithConcurrency(
        pageAccounts,
        threadCount,
        async (account) => {
          const result = await fetchAccount(account, protocols, folder, 1);
          const message = result.messages[0] || null;
          const row: BatchRow = {
            account: result.account,
            message,
            verificationCode: extractVerificationCode(
              message,
              verificationPattern,
            ),
            errors: result.errors,
            completed: true,
            successfulProtocolCount: result.successfulProtocols.length,
          };
          setBatchRows((current) =>
            current.map((item) =>
              item.account.id === account.id ? row : item,
            ),
          );
          return result;
        },
      );
      setAccounts((current) => {
        const updated = new Map(
          results.map((result) => [result.account.id, result.account]),
        );
        return current.map((account) => updated.get(account.id) || account);
      });
      const successCount = results.filter(
        (result) => result.messages.length,
      ).length;
      toast.success("批量取件完成", {
        description: `当前页 ${successCount}/${pageAccounts.length} 个账号获取到邮件。`,
      });
    } catch (error) {
      toast.error("批量取件失败", { description: errorMessage(error) });
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleSingleFetch(
    account = selectedAccount,
    page = singlePage,
    pageSize = singlePageSize,
  ) {
    if (!account) {
      toast.error("请选择邮箱账号");
      return;
    }
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * pageSize;
    setSingleLoading(true);
    setSinglePage(safePage);
    setSingleResult((current) =>
      current?.account.id === account.id ? { ...current, messages: [] } : null,
    );
    try {
      const result = await fetchAccount(
        account,
        protocols,
        folder,
        pageSize,
        offset,
      );
      setSingleResult(result);
      setAccounts((current) =>
        current.map((item) =>
          item.id === result.account.id ? result.account : item,
        ),
      );
      if (result.messages.length) {
        toast.success(
          `第 ${safePage} 页已获取 ${result.messages.length} 封邮件`,
        );
      } else if (result.errors.length) {
        toast.error("取件失败", {
          description: result.errors
            .map((item) => `${item.protocol}: ${item.message}`)
            .join("；"),
        });
      } else {
        toast.info("取件成功，当前文件夹暂无邮件");
      }
    } catch (error) {
      toast.error("取件失败", { description: errorMessage(error) });
    } finally {
      setSingleLoading(false);
    }
  }

  function deleteAccount(accountId: string) {
    setAccounts((current) =>
      current.filter((account) => account.id !== accountId),
    );
    setBatchRows((current) =>
      current.filter((row) => row.account.id !== accountId),
    );
    if (singleResult?.account.id === accountId) {
      setSingleResult(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <img src={siteLogo} alt="CCMTC" />
          </div>
          <div>
            <strong>Mail</strong>
            <span>Outlook OAuth 桌面取件</span>
          </div>
        </div>

        {adSlot ? (
          <div className="topbar-ad">
            <SiteAdCard config={adSlot} compact />
          </div>
        ) : (
          <div className="topbar-spacer" />
        )}

        <div className="topbar-actions">
          <div className="mode-switch" aria-label="取件模式">
            <button
              className={mode === "batch" ? "active" : ""}
              onClick={() => setMode("batch")}
            >
              <TablePropertiesIcon size={15} />
              批量取件
            </button>
            <button
              className={mode === "single" ? "active" : ""}
              onClick={() => setMode("single")}
            >
              <LayoutListIcon size={15} />
              单邮箱
            </button>
          </div>
          <button
            className="icon-button"
            onClick={() =>
              setTheme((value) => (value === "dark" ? "light" : "dark"))
            }
            aria-label="切换主题"
          >
            {theme === "dark" ? <SunIcon size={17} /> : <MoonIcon size={17} />}
          </button>
          <button
            className="button button-primary"
            onClick={() => setImportOpen(true)}
          >
            <PlusIcon size={15} />
            导入账号
          </button>
        </div>
      </header>

      <div className="app-content">
        {mode === "batch" ? (
          <section className="workspace-card batch-workspace">
            <header className="workspace-toolbar-header">
              <FetchToolbar
                protocols={protocols}
                folder={folder}
                accountCount={accounts.length}
                onToggleProtocol={toggleProtocol}
                onFolderChange={setFolder}
              >
                <button
                  className="button button-soft"
                  onClick={() => {
                    setRegexDraft(verificationPattern);
                    setRegexOpen(true);
                  }}
                >
                  <FileTextIcon size={14} />
                  验证码正则
                </button>
                <label className="thread-field">
                  <span>取件线程</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={threadCount}
                    onChange={(event) =>
                      setThreadCount(
                        Math.max(
                          1,
                          Math.min(30, Number(event.target.value) || 1),
                        ),
                      )
                    }
                  />
                </label>
                <button
                  className="button button-primary"
                  onClick={() => void handleBatchFetch()}
                  disabled={batchLoading}
                >
                  {batchLoading ? (
                    <LoaderCircleIcon className="spin" size={15} />
                  ) : (
                    <PlayIcon size={15} />
                  )}
                  {batchLoading ? "取件中" : "读取当前页"}
                </button>
              </FetchToolbar>
            </header>

            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th className="index-column">#</th>
                    <th>邮箱</th>
                    <th>最新邮件</th>
                    <th>验证码</th>
                    <th>时间</th>
                    <th className="status-column">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBatchRows.length ? (
                    visibleBatchRows.map((row, index) => {
                      const absoluteIndex =
                        (batchPage - 1) * batchPageSize + index + 1;
                      const hasError =
                        row.successfulProtocolCount === 0 &&
                        row.errors.length > 0 &&
                        !row.message;
                      const completedWithoutMail =
                        row.completed && !row.message && !hasError;
                      return (
                        <tr
                          key={row.account.id}
                          className={row.message ? "clickable-row" : ""}
                          onClick={() =>
                            row.message &&
                            setDialogContext({
                              account: row.account,
                              message: row.message,
                            })
                          }
                        >
                          <td className="index-cell">{absoluteIndex}</td>
                          <td>
                            <div className="email-cell">
                              <span className="mail-avatar">
                                {row.account.email.slice(0, 1).toUpperCase()}
                              </span>
                              <div>
                                <strong>{row.account.email}</strong>
                                <small>
                                  {row.message ? (
                                    <ProtocolBadge
                                      protocol={row.message.protocol}
                                    />
                                  ) : row.completed ? (
                                    hasError ? (
                                      "取件失败"
                                    ) : (
                                      "暂无邮件"
                                    )
                                  ) : (
                                    "等待结果"
                                  )}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>
                            {row.message ? (
                              <div className="subject-cell">
                                <strong>
                                  {row.message.subject || "(无主题)"}
                                </strong>
                                <small>
                                  {row.message.preview || "暂无正文摘要"}
                                </small>
                              </div>
                            ) : (
                              <span className="muted-text">
                                {hasError
                                  ? row.errors
                                      .map((item) => item.message)
                                      .join("；")
                                  : !row.completed && batchLoading
                                    ? "正在取件..."
                                    : "暂无邮件"}
                              </span>
                            )}
                          </td>
                          <td>
                            {row.verificationCode ? (
                              <button
                                className="code-pill"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void navigator.clipboard.writeText(
                                    row.verificationCode,
                                  );
                                  toast.success("验证码已复制");
                                }}
                              >
                                {row.verificationCode}
                                <CopyIcon size={12} />
                              </button>
                            ) : (
                              <span className="muted-text">—</span>
                            )}
                          </td>
                          <td className="time-cell">
                            {row.message
                              ? formatDateTime(row.message.received_at)
                              : "—"}
                          </td>
                          <td>
                            <span
                              className={`status-dot ${
                                row.message
                                  ? "success"
                                  : hasError
                                    ? "error"
                                    : completedWithoutMail
                                      ? "success"
                                      : "idle"
                              }`}
                            >
                              {row.message ? (
                                <CheckCircle2Icon size={13} />
                              ) : hasError ? (
                                <CircleAlertIcon size={13} />
                              ) : completedWithoutMail ? (
                                <CheckCircle2Icon size={13} />
                              ) : (
                                <LoaderCircleIcon
                                  className={batchLoading ? "spin" : ""}
                                  size={13}
                                />
                              )}
                              {row.message
                                ? "成功"
                                : hasError
                                  ? "失败"
                                  : completedWithoutMail
                                    ? "无邮件"
                                    : "待取件"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          icon={TablePropertiesIcon}
                          title="还没有批量取件结果"
                          description="导入账号后，设置协议和线程数开始取件。"
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager
              page={batchPage}
              totalPages={batchTotalPages}
              total={batchRows.length}
              pageSize={batchPageSize}
              disabled={batchLoading}
              onChange={setBatchPage}
              onPageSizeChange={(size) => {
                setBatchPageSize(size);
                setBatchPage(1);
              }}
            />
          </section>
        ) : (
          <section className="single-layout">
            <aside className="workspace-card account-sidebar">
              <header className="sidebar-header">
                <div>
                  <span className="eyebrow">Accounts</span>
                  <h2>邮箱列表</h2>
                </div>
                <span className="sidebar-account-count">
                  <UsersIcon size={13} />
                  {accounts.length}
                </span>
              </header>
              <label className="search-field">
                <SearchIcon size={14} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索邮箱"
                />
              </label>
              <div className="account-list">
                {filteredAccounts.length ? (
                  filteredAccounts.map((account) => (
                    <button
                      key={account.id}
                      className={`account-item ${selectedAccountId === account.id ? "active" : ""}`}
                      onClick={() => {
                        setSelectedAccountId(account.id);
                        setSinglePage(1);
                        setSingleResult(null);
                      }}
                    >
                      <span className="mail-avatar">
                        {account.email.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="account-copy">
                        <strong>{account.email}</strong>
                        <small>OAuth 账号</small>
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        className="account-delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteAccount(account.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") deleteAccount(account.id);
                        }}
                      >
                        <Trash2Icon size={14} />
                      </span>
                    </button>
                  ))
                ) : (
                  <EmptyState
                    icon={UsersIcon}
                    title="暂无账号"
                    description="请点击顶部的导入账号按钮"
                  />
                )}
              </div>
              {accounts.length ? (
                <button
                  className="button button-ghost clear-button"
                  onClick={() => {
                    if (window.confirm("确定清空所有本地账号吗？")) {
                      setAccounts([]);
                      setBatchRows([]);
                      setSingleResult(null);
                    }
                  }}
                >
                  <Trash2Icon size={14} />
                  清空全部
                </button>
              ) : null}
            </aside>

            <section className="workspace-card single-workspace">
              <header className="workspace-header single-header">
                <div className="single-mailbox-title">
                  <span className="eyebrow">Single mailbox</span>
                  <h1>{selectedAccount?.email || "选择一个邮箱"}</h1>
                  <p>左侧选择账号，右侧查看邮件。</p>
                </div>
                <div className="single-fetch-toolbar">
                  <FetchToolbar
                    protocols={protocols}
                    folder={folder}
                    onToggleProtocol={toggleProtocol}
                    onFolderChange={setFolder}
                  >
                    <button
                      className="button button-primary"
                      disabled={!selectedAccount || singleLoading}
                      onClick={() => void handleSingleFetch()}
                    >
                      {singleLoading ? (
                        <LoaderCircleIcon className="spin" size={15} />
                      ) : (
                        <RefreshCwIcon size={15} />
                      )}
                      {singleLoading ? "取件中" : "刷新邮件"}
                    </button>
                  </FetchToolbar>
                </div>
              </header>

              {singleResult?.errors.length ? (
                <div className="inline-alert">
                  <CircleAlertIcon size={15} />
                  <span>
                    {singleResult.errors
                      .map((item) => `${item.protocol}: ${item.message}`)
                      .join("；")}
                  </span>
                </div>
              ) : null}

              <div className="message-list">
                {visibleSingleMessages.length ? (
                  visibleSingleMessages.map((message) => {
                    const code = extractVerificationCode(
                      message,
                      verificationPattern,
                    );
                    return (
                      <button
                        key={messageKey(message)}
                        className="message-item"
                        onClick={() =>
                          selectedAccount &&
                          setDialogContext({
                            account: selectedAccount,
                            message,
                          })
                        }
                      >
                        <span className="message-icon">
                          <MailIcon size={16} />
                        </span>
                        <span className="message-main">
                          <span className="message-title-row">
                            <strong>{message.subject || "(无主题)"}</strong>
                            <span>{formatDateTime(message.received_at)}</span>
                          </span>
                          <span className="message-meta">
                            <ProtocolBadge protocol={message.protocol} />
                            <span>{message.sender}</span>
                          </span>
                          <small>{message.preview || "暂无正文摘要"}</small>
                        </span>
                        {code ? (
                          <span className="code-pill static">{code}</span>
                        ) : null}
                      </button>
                    );
                  })
                ) : singleLoading ? (
                  <EmptyState
                    icon={LoaderCircleIcon}
                    title="正在读取邮件"
                    description="IMAP 和 Graph 可能需要几秒钟。"
                  />
                ) : (
                  <EmptyState
                    icon={FileTextIcon}
                    title="暂无邮件内容"
                    description="选择账号并点击刷新邮件。"
                  />
                )}
              </div>
              <Pager
                page={singlePage}
                totalPages={singleTotalPages}
                total={singleTotal}
                pageSize={singlePageSize}
                disabled={singleLoading}
                onChange={(page) =>
                  void handleSingleFetch(selectedAccount, page, singlePageSize)
                }
                onPageSizeChange={(size) => {
                  setSinglePageSize(size);
                  setSinglePage(1);
                  if (selectedAccount) {
                    void handleSingleFetch(selectedAccount, 1, size);
                  }
                }}
              />
            </section>
          </section>
        )}
      </div>

      <ImportDialog
        open={importOpen}
        value={importText}
        onValueChange={setImportText}
        onClose={() => setImportOpen(false)}
        onSubmit={handleImport}
      />
      <RegexDialog
        open={regexOpen}
        value={regexDraft}
        onValueChange={setRegexDraft}
        onClose={() => setRegexOpen(false)}
        onSave={handleRegexSave}
      />
      <MessageDialog
        context={dialogContext}
        verificationPattern={verificationPattern}
        onClose={() => setDialogContext(null)}
      />
    </main>
  );
}
