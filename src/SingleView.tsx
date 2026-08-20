import {
  CircleAlertIcon,
  FileTextIcon,
  LoaderCircleIcon,
  MailIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { MessageContext } from "./dialogs";
import {
  extractVerificationCode,
  formatDateTime,
  type AccountFetchResult,
  type MailAccount,
  type MailMessage,
  type MailProtocol,
} from "./mail";
import type { Settings } from "./settings";
import {
  Avatar,
  Button,
  CodePill,
  cx,
  EmptyState,
  Eyebrow,
  FetchToolbar,
  Pager,
  ProtocolBadge,
} from "./ui";

function messageKey(message: MailMessage) {
  return `${message.protocol}:${message.folder}:${message.id}`;
}

const SIDEBAR_PAGE_SIZE = 20;

function AccountSidebar({
  accounts,
  selectedId,
  onSelect,
  onDelete,
  onClearAll,
}: {
  accounts: MailAccount[];
  selectedId: string;
  onSelect: (accountId: string) => void;
  onDelete: (accountId: string) => void;
  onClearAll: () => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return accounts;
    return accounts.filter((account) =>
      account.email.toLowerCase().includes(keyword),
    );
  }, [accounts, query]);

  // Clamped on read rather than in an effect, so deleting the last account on
  // a page falls back to the previous one without an extra render.
  const totalPages = Math.max(1, Math.ceil(filtered.length / SIDEBAR_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (safePage - 1) * SIDEBAR_PAGE_SIZE,
    safePage * SIDEBAR_PAGE_SIZE,
  );

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r border-line bg-surface">
      <header className="flex min-h-61 shrink-0 items-center justify-between border-b border-line py-9 pr-10 pl-12">
        <div>
          <Eyebrow>Accounts</Eyebrow>
          <h2 className="mt-2 text-lg tracking-tight">邮箱列表</h2>
        </div>
        <span className="inline-flex h-26 items-center gap-5 rounded-sm border border-line bg-muted px-8 text-xs font-bold text-soft">
          <UsersIcon size={13} />
          {accounts.length}
        </span>
      </header>

      <label className="mx-9 mt-9 mb-5 flex h-34 shrink-0 items-center gap-7 rounded-sm border border-line bg-muted px-9 text-faint">
        <SearchIcon size={14} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="搜索邮箱"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-0"
        />
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-4 pb-7">
        {visible.length ? (
          visible.map((account) => (
            <div
              key={account.id}
              className={cx(
                "group flex w-full min-w-0 items-center gap-8 rounded-md border p-7",
                selectedId === account.id
                  ? "border-primary/25 bg-primary-soft"
                  : "border-transparent hover:bg-hover",
              )}
            >
              <button
                onClick={() => onSelect(account.id)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-8 text-left"
              >
                <Avatar email={account.email} />
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-semibold">
                    {account.email}
                  </strong>

                </span>
              </button>
              <button
                onClick={() => onDelete(account.id)}
                aria-label={`删除 ${account.email}`}
                className="grid size-24 shrink-0 cursor-pointer place-items-center rounded-xs text-transparent group-hover:text-faint hover:bg-danger-soft hover:text-danger!"
              >
                <Trash2Icon size={14} />
              </button>
            </div>
          ))
        ) : (
          <EmptyState
            icon={UsersIcon}
            title={query ? "没有匹配的邮箱" : "暂无账号"}
            description={query ? "换个关键词试试" : "请点击顶部的导入账号按钮"}
          />
        )}
      </div>

      {totalPages > 1 ? (
        <Pager
          compact
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          onChange={setPage}
        />
      ) : null}

      {accounts.length ? (
        <Button
          variant="ghost"
          className="mx-8 mb-8 min-h-32 shrink-0"
          onClick={onClearAll}
        >
          <Trash2Icon size={14} />
          清空全部
        </Button>
      ) : null}
    </aside>
  );
}

export function SingleView({
  accounts,
  selectedId,
  result,
  loading,
  page,
  settings,
  onUpdateSettings,
  onToggleProtocol,
  onSelect,
  onDelete,
  onClearAll,
  onFetch,
  onOpenMessage,
}: {
  accounts: MailAccount[];
  selectedId: string;
  result: AccountFetchResult | null;
  loading: boolean;
  page: number;
  settings: Settings;
  onUpdateSettings: (patch: Partial<Settings>) => void;
  onToggleProtocol: (protocol: MailProtocol) => void;
  onSelect: (accountId: string) => void;
  onDelete: (accountId: string) => void;
  onClearAll: () => void;
  onFetch: (page: number, pageSize: number) => void;
  onOpenMessage: (context: MessageContext) => void;
}) {
  const { folder, protocols, singlePageSize, verificationPattern } = settings;
  const selected = accounts.find((account) => account.id === selectedId) || null;
  const messages = result?.messages || [];
  const total = result?.total || 0;

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[245px_minmax(0,1fr)] max-[1080px]:grid-cols-[220px_minmax(0,1fr)]">
      <AccountSidebar
        accounts={accounts}
        selectedId={selectedId}
        onSelect={onSelect}
        onDelete={onDelete}
        onClearAll={onClearAll}
      />

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface">
        <header className="flex min-h-72 shrink-0 items-center justify-between gap-14 border-b border-line px-14 py-11">
          <div className="min-w-0 flex-1">
            <h1 className="mt-2 max-w-620 truncate text-2xl tracking-tight">
              {selected?.email || "选择一个邮箱"}
            </h1>
            <p className="mt-3 text-xs text-faint">左侧选择账号，右侧查看邮件。</p>
          </div>
          <div className="ml-auto min-w-0 shrink-0">
            <FetchToolbar
              bare
              protocols={protocols}
              folder={folder}
              onToggleProtocol={onToggleProtocol}
              onFolderChange={(next) => onUpdateSettings({ folder: next })}
            >
              <Button
                variant="primary"
                disabled={!selected || loading}
                onClick={() => onFetch(page, singlePageSize)}
              >
                {loading ? (
                  <LoaderCircleIcon className="animate-spin" size={15} />
                ) : (
                  <RefreshCwIcon size={15} />
                )}
                {loading ? "取件中" : "刷新邮件"}
              </Button>
            </FetchToolbar>
          </div>
        </header>

        {result?.errors.length ? (
          <div className="flex shrink-0 items-start gap-7 border-b border-danger/25 bg-danger-soft px-12 py-7 text-xs text-danger">
            <CircleAlertIcon size={15} className="shrink-0" />
            <span>
              {result.errors
                .map((item) => `${item.protocol}: ${item.message}`)
                .join("；")}
            </span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {messages.length ? (
            messages.map((message) => (
              <MessageRow
                key={messageKey(message)}
                message={message}
                code={extractVerificationCode(message, verificationPattern)}
                onOpen={() =>
                  selected && onOpenMessage({ account: selected, message })
                }
              />
            ))
          ) : loading ? (
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
          page={page}
          totalPages={Math.max(1, Math.ceil(total / singlePageSize))}
          total={total}
          pageSize={singlePageSize}
          disabled={loading}
          onChange={(next) => onFetch(next, singlePageSize)}
          onPageSizeChange={(size) => {
            onUpdateSettings({ singlePageSize: size });
            onFetch(1, size);
          }}
        />
      </div>
    </section>
  );
}

function MessageRow({
  message,
  code,
  onOpen,
}: {
  message: MailMessage;
  code: string;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full min-w-0 cursor-pointer items-center gap-10 rounded-md border border-transparent border-b-line p-9 text-left hover:border-primary/25 hover:bg-primary-soft/40"
    >
      <span className="grid size-31 shrink-0 place-items-center rounded-sm bg-primary-soft text-primary">
        <MailIcon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center justify-between gap-10">
          <strong className="truncate text-sm font-semibold">
            {message.subject || "(无主题)"}
          </strong>
          <span className="shrink-0 text-2xs text-faint">
            {formatDateTime(message.received_at)}
          </span>
        </span>
        <span className="mt-3 flex items-center gap-6 text-2xs text-soft">
          <ProtocolBadge protocol={message.protocol} />
          <span className="truncate">{message.sender}</span>
        </span>
        <small className="mt-4 block truncate text-2xs text-faint">
          {message.preview || "暂无正文摘要"}
        </small>
      </span>
      {code ? <CodePill>{code}</CodePill> : null}
    </button>
  );
}
