import { CopyIcon, PlusIcon, UploadIcon } from "lucide-react";
import { useRef, type FormEvent } from "react";
import { toast } from "sonner";

import {
  DEFAULT_VERIFICATION_PATTERN,
  extractVerificationCode,
  formatDateTime,
  type MailAccount,
  type MailMessage,
} from "./mail";
import {
  Button,
  cx,
  Dialog,
  DialogFooter,
  DialogHeading,
  FieldLabel,
  ProtocolBadge,
  TEXTAREA_CLASS,
} from "./ui";

export type MessageContext = { account: MailAccount; message: MailMessage };

export function MessageDialog({
  context,
  verificationPattern,
  onClose,
}: {
  context: MessageContext | null;
  verificationPattern: string;
  onClose: () => void;
}) {
  if (!context) {
    return null;
  }
  const { account, message } = context;
  const code = extractVerificationCode(message, verificationPattern);
  return (
    <Dialog
      onClose={onClose}
      className="h-[min(88vh,720px)] w-[min(94vw,860px)]"
      heading={
        <>
          <div className="flex items-center gap-7 text-xs text-soft">
            <ProtocolBadge protocol={message.protocol} />
            <span className="truncate">{account.email}</span>
          </div>
          <h2 className="mt-2 truncate text-xl tracking-tight">
            {message.subject || "(无主题)"}
          </h2>
          <p className="mt-3 truncate text-xs text-faint">
            {message.sender} · {formatDateTime(message.received_at)}
          </p>
        </>
      }
    >
      {code ? (
        <div className="flex min-h-48 shrink-0 items-center gap-10 border-b border-primary/25 bg-primary-soft px-14 py-8">
          <span className="text-xs text-soft">识别到验证码</span>
          <strong className="font-mono text-2xl tracking-[0.12em] text-primary">
            {code}
          </strong>
          <Button
            small
            className="ml-auto"
            onClick={() => {
              void navigator.clipboard.writeText(code);
              toast.success("验证码已复制");
            }}
          >
            <CopyIcon size={13} />
            复制
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {message.body_type === "html" ? (
          <iframe
            title="邮件正文"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={message.body}
            className="size-full border-0 bg-white"
          />
        ) : (
          <pre className="h-full overflow-auto p-16 font-sans text-base leading-[1.7] break-words whitespace-pre-wrap">
            {message.body || message.preview || "暂无正文内容"}
          </pre>
        )}
      </div>
    </Dialog>
  );
}

export function ImportDialog({
  value,
  onValueChange,
  onClose,
  onSubmit,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <Dialog
      onClose={onClose}
      heading={
        <DialogHeading
          eyebrow="账号管理"
          title="手动导入 Outlook OAuth 账号"
          description="仅保存在当前电脑。支持 TXT 文件或直接粘贴文本。"
        />
      }
    >
      <form
        onSubmit={onSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto p-13"
      >
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
          onClick={() => inputRef.current?.click()}
          className="flex min-h-58 w-full shrink-0 cursor-pointer items-center gap-10 rounded-lg border border-dashed border-primary/45 bg-primary-soft px-12 py-10 text-left text-primary"
        >
          <UploadIcon size={18} />
          <span className="flex flex-col">
            <strong className="text-sm">选择 TXT 文件</strong>
            <small className="mt-2 text-2xs text-soft">
              文件内容会载入下方文本框，可确认后再导入
            </small>
          </span>
        </button>

        <FieldLabel htmlFor="account-import-text">账号文本</FieldLabel>
        <textarea
          id="account-import-text"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          rows={12}
          spellCheck={false}
          placeholder="account@example.com----password----client_id----refresh_token"
          className={cx(TEXTAREA_CLASS, "min-h-220 text-xs")}
        />
        <p className="mx-2 mt-6 text-2xs text-faint">
          一行一个账号，格式：邮箱----密码----Client ID----Refresh Token
        </p>

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="primary">
            <PlusIcon size={15} />
            导入账号
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export function RegexDialog({
  value,
  onValueChange,
  onClose,
  onSave,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog
      onClose={onClose}
      className="w-[min(94vw,720px)]"
      heading={
        <DialogHeading
          eyebrow="Batch mailbox"
          title="验证码正则表达式"
          description="依次匹配邮件主题、摘要和正文，优先返回第一个捕获组。"
        />
      }
    >
      <form onSubmit={onSave} className="flex flex-col p-13">
        <FieldLabel htmlFor="verification-pattern">正则表达式</FieldLabel>
        <textarea
          id="verification-pattern"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          rows={6}
          spellCheck={false}
          className={cx(TEXTAREA_CLASS, "min-h-150 text-sm")}
        />
        <p className="mx-2 mt-6 text-2xs text-faint">
          示例：{String.raw`验证码[^\d]{0,12}(\d{6})`}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="mr-auto"
            onClick={() => onValueChange(DEFAULT_VERIFICATION_PATTERN)}
          >
            恢复默认
          </Button>
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="primary">
            保存正则
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
