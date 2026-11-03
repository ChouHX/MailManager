# MailManager

独立的 Tauri 2 + React + Tailwind CSS 4 桌面取件工具，只在本机保存手动导入的 Outlook OAuth 账号。

## 功能

- TXT 文件与文本框手动导入账号，可将全部账号导出为兼容的 TXT 文件
- IMAP / Microsoft Graph 协议单选或双选
- 批量取件：按当前页读取、默认 5 个并发、验证码正则提取
- 单邮箱取件：IMAP / Graph 服务端分页、邮件列表和正文详情弹窗
- 本机 HTTP API：按已导入的邮箱地址读取邮件，OAuth 凭据不会暴露给调用方
- 收件箱 / 垃圾箱切换
- 复用 `ccmtc.cfd` 站点广告配置（图标占位，不加载远程图片）；站点不可用时回退到内置广告 `HShop`（`https://opcuu.com/redeem`）
- 明暗主题与紧凑桌面布局

账号格式：

```text
account@example.com----password----client_id----refresh_token
```

## 开发

```bash
pnpm install
pnpm dev
```

## 检查与构建

```bash
pnpm check
pnpm lint
pnpm build:web
pnpm build
```

Rust 后端直接连接 Microsoft OAuth、Outlook IMAP 与 Graph API，不依赖任何外部 Node 服务。

应用运行时会在 `127.0.0.1:18765` 提供本机 API：

```text
GET  /api/v1/health
POST /api/v1/messages
```

邮件查询请求只需提供已导入的邮箱地址，例如 `{"email":"account@example.com"}`。
完整参数、响应结构和可复制的 cURL 示例可通过首页的“API 文档”按钮查看。

## 自动发布

推送语义化版本标签即可触发 GitHub Actions：

```bash
git tag v0.1.0
git push origin v0.1.0
```

Actions 会构建并发布：

- Linux x86_64：DEB、RPM、AppImage
- Windows x86_64：NSIS、MSI
- macOS Intel：DMG、App
- macOS Apple Silicon：DMG、App
