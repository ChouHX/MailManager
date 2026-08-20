import {
  LayoutListIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  TablePropertiesIcon,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { fetchSiteAdConfig, type AdSlotConfig } from "./ad";
import { BatchView } from "./BatchView";
import {
  ImportDialog,
  MessageDialog,
  RegexDialog,
  type MessageContext,
} from "./dialogs";
import {
  errorMessage,
  extractVerificationCode,
  fetchAccount,
  parseAccountText,
  runWithConcurrency,
  type AccountFetchResult,
  type BatchRow,
  type MailAccount,
  type MailProtocol,
} from "./mail";
import {
  readAccounts,
  readSettings,
  writeAccounts,
  writeSettings,
  type Settings,
} from "./settings";
import { SingleView } from "./SingleView";
import { SiteAdCard } from "./SiteAdCard";
import { Button, IconButton, Segmented } from "./ui";
import siteLogo from "../src-tauri/icons/128x128.png";

function emptyRow(account: MailAccount): BatchRow {
  return {
    account,
    message: null,
    verificationCode: "",
    errors: [],
    loading: false,
    completed: false,
    successfulProtocolCount: 0,
  };
}

function mergeAccounts(current: MailAccount[], incoming: MailAccount[]) {
  const values = new Map(current.map((account) => [account.id, account]));
  for (const account of incoming) {
    values.set(account.id, account);
  }
  return [...values.values()];
}

export default function App() {
  const [settings, setSettings] = useState(readSettings);
  const [accounts, setAccounts] = useState(readAccounts);
  const [mode, setMode] = useState<"batch" | "single">("batch");
  const [selectedAccountId, setSelectedAccountId] = useState(
    () => accounts[0]?.id || "",
  );
  const [batchRows, setBatchRows] = useState<BatchRow[]>(() =>
    accounts.map(emptyRow),
  );
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchPage, setBatchPage] = useState(1);
  const [singleResult, setSingleResult] = useState<AccountFetchResult | null>(
    null,
  );
  const [singleLoading, setSingleLoading] = useState(false);
  const [singlePage, setSinglePage] = useState(1);
  // `null` means the dialog is closed; a string is the current draft.
  const [importText, setImportText] = useState<string | null>(null);
  const [regexDraft, setRegexDraft] = useState<string | null>(null);
  const [messageContext, setMessageContext] = useState<MessageContext | null>(
    null,
  );
  const [adSlot, setAdSlot] = useState<AdSlotConfig | null>(null);

  function updateSettings(patch: Partial<Settings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  useEffect(() => {
    void fetchSiteAdConfig()
      .then((config) => setAdSlot(config.enabled ? config : null))
      .catch(() => setAdSlot(null));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
    writeSettings(settings);
  }, [settings]);

  useEffect(() => {
    writeAccounts(accounts);
    setSelectedAccountId((current) =>
      accounts.some((account) => account.id === current)
        ? current
        : accounts[0]?.id || "",
    );
    setBatchRows((current) => {
      const existing = new Map(current.map((row) => [row.account.id, row]));
      return accounts.map((account) => {
        const row = existing.get(account.id);
        return row ? { ...row, account } : emptyRow(account);
      });
    });
  }, [accounts]);

  useEffect(() => {
    const pages = Math.max(
      1,
      Math.ceil(batchRows.length / settings.batchPageSize),
    );
    setBatchPage((current) => Math.min(current, pages));
  }, [batchRows.length, settings.batchPageSize]);

  useEffect(() => {
    const pages = Math.max(
      1,
      Math.ceil((singleResult?.total || 0) / settings.singlePageSize),
    );
    setSinglePage((current) => Math.min(current, pages));
  }, [singleResult, settings.singlePageSize]);

  function toggleProtocol(protocol: MailProtocol) {
    const { protocols } = settings;
    if (!protocols.includes(protocol)) {
      updateSettings({ protocols: [...protocols, protocol] });
      return;
    }
    if (protocols.length === 1) {
      toast.error("至少保留一个取件协议");
      return;
    }
    updateSettings({
      protocols: protocols.filter((value) => value !== protocol),
    });
  }

  function validPattern(pattern: string) {
    try {
      new RegExp(pattern, "i");
      return true;
    } catch (error) {
      toast.error("验证码正则表达式无效", { description: errorMessage(error) });
      return false;
    }
  }

  function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAccountText(importText || "");
    if (!parsed.accounts.length) {
      toast.error("没有解析到有效账号", {
        description: "请检查邮箱----密码----Client ID----Refresh Token 格式。",
      });
      return;
    }
    setAccounts((current) => mergeAccounts(current, parsed.accounts));
    setSelectedAccountId(parsed.accounts[0].id);
    setSingleResult(null);
    setImportText(null);
    toast.success(`已导入 ${parsed.accounts.length} 个账号`, {
      description: parsed.invalidLines.length
        ? `另有 ${parsed.invalidLines.length} 行格式错误，已跳过。`
        : "账号仅保存在当前电脑。",
    });
  }

  function handleRegexSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pattern = regexDraft || "";
    if (!validPattern(pattern)) {
      return;
    }
    updateSettings({ verificationPattern: pattern });
    setBatchRows((current) =>
      current.map((row) => ({
        ...row,
        verificationCode: extractVerificationCode(row.message, pattern),
      })),
    );
    setRegexDraft(null);
    toast.success("验证码正则已保存");
  }

  /** Fetches the newest message for each target and folds the results back
   *  into the batch rows and the stored accounts (refresh tokens rotate). */
  async function fetchRows(targets: MailAccount[], concurrency: number) {
    const { folder, protocols, verificationPattern } = settings;
    const targetIds = new Set(targets.map((account) => account.id));
    setBatchRows((current) =>
      current.map((row) =>
        targetIds.has(row.account.id)
          ? { ...emptyRow(row.account), loading: true }
          : row,
      ),
    );
    try {
      const results = await runWithConcurrency(
        targets,
        concurrency,
        async (account) => {
          const result = await fetchAccount(account, protocols, folder, 1);
          const message = result.messages[0] || null;
          setBatchRows((current) =>
            current.map((item) =>
              item.account.id === account.id
                ? {
                    account: result.account,
                    message,
                    verificationCode: extractVerificationCode(
                      message,
                      verificationPattern,
                    ),
                    errors: result.errors,
                    loading: false,
                    completed: true,
                    successfulProtocolCount: result.successfulProtocols.length,
                  }
                : item,
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
      return results;
    } finally {
      // Never leave a spinner behind if a worker blew up mid-flight.
      setBatchRows((current) =>
        current.map((row) =>
          row.loading && targetIds.has(row.account.id)
            ? { ...row, loading: false }
            : row,
        ),
      );
    }
  }

  async function fetchBatchPage() {
    const { batchPageSize, threadCount, verificationPattern } = settings;
    if (!validPattern(verificationPattern)) {
      return;
    }
    if (!accounts.length) {
      toast.error("请先导入账号");
      setImportText("");
      return;
    }
    const start = (batchPage - 1) * batchPageSize;
    const pageAccounts = accounts.slice(start, start + batchPageSize);
    if (!pageAccounts.length) {
      toast.info("当前页没有可读取的账号");
      return;
    }
    setBatchLoading(true);
    try {
      const results = await fetchRows(pageAccounts, threadCount);
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

  async function fetchOneRow(row: BatchRow) {
    if (!validPattern(settings.verificationPattern)) {
      return;
    }
    try {
      const [result] = await fetchRows([row.account], 1);
      if (result.messages.length) {
        toast.success(`${row.account.email} 已取到最新邮件`);
      } else if (result.errors.length) {
        toast.error(`${row.account.email} 取件失败`, {
          description: result.errors
            .map((item) => `${item.protocol}: ${item.message}`)
            .join("；"),
        });
      } else {
        toast.info(`${row.account.email} 当前文件夹暂无邮件`);
      }
    } catch (error) {
      toast.error("取件失败", { description: errorMessage(error) });
    }
  }

  function deleteAccount(accountId: string) {
    setAccounts((current) =>
      current.filter((account) => account.id !== accountId),
    );
    if (singleResult?.account.id === accountId) {
      setSingleResult(null);
    }
  }

  async function fetchSingle(page: number, pageSize: number) {
    const account = accounts.find((item) => item.id === selectedAccountId);
    if (!account) {
      toast.error("请选择邮箱账号");
      return;
    }
    const safePage = Math.max(1, page);
    setSingleLoading(true);
    setSinglePage(safePage);
    setSingleResult((current) =>
      current?.account.id === account.id ? { ...current, messages: [] } : null,
    );
    try {
      const result = await fetchAccount(
        account,
        settings.protocols,
        settings.folder,
        pageSize,
        (safePage - 1) * pageSize,
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

  return (
    <main className="flex h-full min-w-0 flex-col">
      <header className="z-20 flex min-h-62 shrink-0 items-center justify-between gap-16 border-b border-line/80 bg-surface px-14 py-7">
        <div className="flex shrink-0 items-center gap-10">
          <img
            src={siteLogo}
            alt="CCMTC"
            className="size-36 shrink-0 object-contain"
          />
          <div className="flex flex-col items-start leading-tight">
            <strong className="text-lg tracking-tight">Mail</strong>
            <span className="mt-3 text-2xs text-faint max-[900px]:hidden">
              Outlook OAuth 桌面取件
            </span>
          </div>
        </div>

        {adSlot ? (
          <div className="mx-auto min-w-180 max-w-720 flex-1 px-14">
            <SiteAdCard config={adSlot} />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex shrink-0 items-center gap-8">
          <Segmented
            label="取件模式"
            value={mode}
            onChange={setMode}
            options={[
              {
                value: "batch",
                label: (
                  <>
                    <TablePropertiesIcon size={15} />
                    批量取件
                  </>
                ),
              },
              {
                value: "single",
                label: (
                  <>
                    <LayoutListIcon size={15} />
                    单邮箱
                  </>
                ),
              },
            ]}
          />
          <IconButton
            aria-label="切换主题"
            onClick={() =>
              updateSettings({
                theme: settings.theme === "dark" ? "light" : "dark",
              })
            }
          >
            {settings.theme === "dark" ? (
              <SunIcon size={17} />
            ) : (
              <MoonIcon size={17} />
            )}
          </IconButton>
          <Button variant="primary" onClick={() => setImportText("")}>
            <PlusIcon size={15} />
            导入账号
          </Button>
        </div>
      </header>

      {mode === "batch" ? (
        <BatchView
          rows={batchRows}
          loading={batchLoading}
          accountCount={accounts.length}
          page={batchPage}
          settings={settings}
          onUpdateSettings={updateSettings}
          onToggleProtocol={toggleProtocol}
          onOpenRegex={() => setRegexDraft(settings.verificationPattern)}
          onFetch={() => void fetchBatchPage()}
          onFetchRow={(row) => void fetchOneRow(row)}
          onDeleteAccount={deleteAccount}
          onPageChange={setBatchPage}
          onOpenMessage={setMessageContext}
        />
      ) : (
        <SingleView
          accounts={accounts}
          selectedId={selectedAccountId}
          result={singleResult}
          loading={singleLoading}
          page={singlePage}
          settings={settings}
          onUpdateSettings={updateSettings}
          onToggleProtocol={toggleProtocol}
          onSelect={(accountId) => {
            setSelectedAccountId(accountId);
            setSinglePage(1);
            setSingleResult(null);
          }}
          onDelete={deleteAccount}
          onClearAll={() => {
            if (window.confirm("确定清空所有本地账号吗？")) {
              setAccounts([]);
              setSingleResult(null);
            }
          }}
          onFetch={(page, pageSize) => void fetchSingle(page, pageSize)}
          onOpenMessage={setMessageContext}
        />
      )}

      {importText !== null ? (
        <ImportDialog
          value={importText}
          onValueChange={setImportText}
          onClose={() => setImportText(null)}
          onSubmit={handleImport}
        />
      ) : null}
      {regexDraft !== null ? (
        <RegexDialog
          value={regexDraft}
          onValueChange={setRegexDraft}
          onClose={() => setRegexDraft(null)}
          onSave={handleRegexSave}
        />
      ) : null}
      <MessageDialog
        context={messageContext}
        verificationPattern={settings.verificationPattern}
        onClose={() => setMessageContext(null)}
      />
    </main>
  );
}
