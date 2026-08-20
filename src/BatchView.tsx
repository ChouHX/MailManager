import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CopyIcon,
  FileTextIcon,
  LoaderCircleIcon,
  PlayIcon,
  RefreshCwIcon,
  TablePropertiesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import type { MessageContext } from "./dialogs";
import { formatDateTime, type BatchRow, type MailProtocol } from "./mail";
import { clampThreads, MAX_THREADS, MIN_THREADS, type Settings } from "./settings";
import {
  Button,
  CodePill,
  cx,
  EmptyState,
  FetchToolbar,
  IconButton,
  Pager,
  ProtocolBadge,
} from "./ui";

const CELL = "border-b border-line px-10 py-7 align-middle";
const HEAD = `h-34 text-left text-2xs font-bold tracking-[0.055em] text-faint uppercase ${CELL}`;
const MUTED = "block truncate text-2xs text-faint";

const TONES = {
  success: "text-success",
  error: "text-danger",
  idle: "text-faint",
} as const;

function rowStatus(row: BatchRow) {
  if (row.message) {
    return { tone: "success", label: "成功", Icon: CheckCircle2Icon } as const;
  }
  if (!row.successfulProtocolCount && row.errors.length) {
    return { tone: "error", label: "失败", Icon: CircleAlertIcon } as const;
  }
  if (row.completed) {
    return { tone: "success", label: "无邮件", Icon: CheckCircle2Icon } as const;
  }
  return { tone: "idle", label: "待取件", Icon: LoaderCircleIcon } as const;
}

export function BatchView({
  rows,
  loading,
  accountCount,
  page,
  settings,
  onUpdateSettings,
  onToggleProtocol,
  onOpenRegex,
  onFetch,
  onFetchRow,
  onDeleteAccount,
  onPageChange,
  onOpenMessage,
}: {
  rows: BatchRow[];
  loading: boolean;
  accountCount: number;
  page: number;
  settings: Settings;
  onUpdateSettings: (patch: Partial<Settings>) => void;
  onToggleProtocol: (protocol: MailProtocol) => void;
  onOpenRegex: () => void;
  onFetch: () => void;
  onFetchRow: (row: BatchRow) => void;
  onDeleteAccount: (accountId: string) => void;
  onPageChange: (page: number) => void;
  onOpenMessage: (context: MessageContext) => void;
}) {
  const { batchPageSize, folder, protocols, threadCount } = settings;
  const totalPages = Math.max(1, Math.ceil(rows.length / batchPageSize));
  const offset = (page - 1) * batchPageSize;
  const visible = rows.slice(offset, offset + batchPageSize);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
      <header className="shrink-0 border-b border-line px-8 py-7">
        <FetchToolbar
          protocols={protocols}
          folder={folder}
          accountCount={accountCount}
          onToggleProtocol={onToggleProtocol}
          onFolderChange={(next) => onUpdateSettings({ folder: next })}
        >
          <Button onClick={onOpenRegex}>
            <FileTextIcon size={14} />
            验证码正则
          </Button>
          <label className="flex h-34 items-center gap-7 rounded-md border border-line bg-surface pr-7 pl-10">
            <span className="text-xs text-soft">取件线程</span>
            <input
              type="number"
              min={MIN_THREADS}
              max={MAX_THREADS}
              value={threadCount}
              onChange={(event) =>
                onUpdateSettings({
                  threadCount: clampThreads(event.target.value),
                })
              }
              className="h-24 w-42 rounded-xs bg-muted text-center text-ink"
            />
          </label>
          <Button variant="primary" onClick={onFetch} disabled={loading}>
            {loading ? (
              <LoaderCircleIcon className="animate-spin" size={15} />
            ) : (
              <PlayIcon size={15} />
            )}
            {loading ? "取件中" : "读取当前页"}
          </Button>
        </FetchToolbar>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse">
          <thead className="sticky top-0 z-2 bg-surface">
            <tr>
              <th className={cx(HEAD, "w-25 pl-14")}>#</th>
              <th className={cx(HEAD, "w-[22%] max-[1080px]:w-[24%]")}>邮箱</th>
              <th className={cx(HEAD, "w-[34%] max-[1080px]:w-[30%]")}>
                最新邮件
              </th>
              <th className={cx(HEAD, "w-[12%]")}>验证码</th>
              <th className={cx(HEAD, "w-[11%]")}>时间</th>
              <th className={cx(HEAD, "w-82")}>状态</th>
              <th className={cx(HEAD, "w-100")}>操作</th>
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {visible.length ? (
              visible.map((row, index) => (
                <BatchRowCells
                  key={row.account.id}
                  row={row}
                  index={offset + index + 1}
                  onOpenMessage={onOpenMessage}
                  onFetchRow={onFetchRow}
                  onDeleteAccount={onDeleteAccount}
                />
              ))
            ) : (
              <tr>
                <td colSpan={7}>
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
        page={page}
        totalPages={totalPages}
        total={rows.length}
        pageSize={batchPageSize}
        disabled={loading}
        onChange={onPageChange}
        onPageSizeChange={(size) => {
          onUpdateSettings({ batchPageSize: size });
          onPageChange(1);
        }}
      />
    </section>
  );
}

function BatchRowCells({
  row,
  index,
  onOpenMessage,
  onFetchRow,
  onDeleteAccount,
}: {
  row: BatchRow;
  index: number;
  onOpenMessage: (context: MessageContext) => void;
  onFetchRow: (row: BatchRow) => void;
  onDeleteAccount: (accountId: string) => void;
}) {
  const { message, account } = row;
  const status = rowStatus(row);
  return (
    <tr
      className={cx(
        "h-52",
        message && "cursor-pointer hover:*:bg-primary-soft/40",
      )}
      onClick={() => message && onOpenMessage({ account, message })}
    >
      <td className={cx(CELL, "pl-14 text-xs text-faint")}>{index}</td>
      <td className={CELL}>
        <div className="min-w-0">
          <strong className="block truncate text-sm font-semibold">
            {account.email}
          </strong>
          <small className={cx(MUTED, "mt-3")}>
            {message ? (
              <ProtocolBadge protocol={message.protocol} />
            ) : status.tone === "error" ? (
              "取件失败"
            ) : row.completed ? (
              "暂无邮件"
            ) : (
              "等待结果"
            )}
          </small>
        </div>
      </td>
      <td className={CELL}>
        {message ? (
          <div className="min-w-0">
            <strong className="block truncate text-sm font-semibold">
              {message.subject || "(无主题)"}
            </strong>
            <small className={cx(MUTED, "mt-3 leading-tight")}>
              {message.preview || "暂无正文摘要"}
            </small>
          </div>
        ) : (
          <span className={MUTED}>
            {status.tone === "error"
              ? row.errors.map((item) => item.message).join("；")
              : row.loading
                ? "正在取件..."
                : "暂无邮件"}
          </span>
        )}
      </td>
      <td className={CELL}>
        {row.verificationCode ? (
          <CodePill
            onClick={(event) => {
              event.stopPropagation();
              void navigator.clipboard.writeText(row.verificationCode);
              toast.success("验证码已复制");
            }}
          >
            {row.verificationCode}
            <CopyIcon size={12} />
          </CodePill>
        ) : (
          <span className={MUTED}>—</span>
        )}
      </td>
      <td className={cx(CELL, "text-2xs text-faint")}>
        {message ? formatDateTime(message.received_at) : "—"}
      </td>
      <td className={CELL}>
        <span
          className={cx(
            "inline-flex items-center gap-4 text-2xs font-bold",
            TONES[status.tone],
          )}
        >
          <status.Icon
            size={13}
            className={cx(row.loading && "animate-spin")}
          />
          {status.label}
        </span>
      </td>
      <td className={CELL}>
        <div className="flex items-center gap-5">
          <IconButton
            className="size-26 rounded-sm"
            aria-label={`单独取件 ${account.email}`}
            title="单独取件"
            disabled={row.loading}
            onClick={(event) => {
              event.stopPropagation();
              onFetchRow(row);
            }}
          >
            {row.loading ? (
              <LoaderCircleIcon size={13} className="animate-spin" />
            ) : (
              <RefreshCwIcon size={13} />
            )}
          </IconButton>
          <IconButton
            className="size-26 rounded-sm hover:border-danger/40 hover:bg-danger-soft hover:text-danger!"
            aria-label={`删除 ${account.email}`}
            title="删除账号"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteAccount(account.id);
            }}
          >
            <Trash2Icon size={13} />
          </IconButton>
        </div>
      </td>
    </tr>
  );
}
