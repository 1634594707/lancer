# lancer-ctl 实时车道面板

在仓库根目录，一条命令启动本机 Web 面板并打开默认浏览器：

```sh
./scripts/lancer-ctl-dash
```

需要 Node 22+，Lancer 正在运行，Settings → General → Allow local control API 已开启。无需安装依赖、构建或重启桌面应用。独立入口的帮助：

```sh
./scripts/lancer-ctl-dash --help
./scripts/lancer-ctl-dash --user-data-dir /path/to/profile
./scripts/lancer-ctl-dash --port 8787 --no-open
# 也支持与 lancer-ctl 相同的 LANCER_USER_DATA_DIR 环境变量。
```

终端会打印本次面板的完整 URL。`--no-open` 时手动打开此 URL（不是端口根路径）。默认使用随机可用端口；固定端口被占用时会报错，不终止其它进程。Ctrl+C 仅关闭面板服务，不停止/删除任何会话；只关浏览器页不会关闭服务。

## 能看到什么

- 全部已注册工作区的会话，含 archived：标题、模型、状态、cwd、分区、updated 时间、API 提供的 lastLine/stage 摘要。
- Running / pending 会话置顶并高亮，running 指示灯跳动；统计 running、idle、failed 等状态。可按状态筛选或搜索标题、模型、路径、分区。
- 点击任意会话，查看最近 40 项工具调用/状态和消息，以及最新 assistant 回复摘要。长文本分别保留末尾 4,000 / 12,000 字符，工具原始参数不转发到页面。
- 列表和选中会话的 tail 独立每秒查询一次（上次查询完成后计时，不堆叠请求）。底部自动跟随新活动；向上阅读时不强拉到底，可点「回到最新」。
- 断线或 API 关闭时明确标记快照过期并自动重试；重新连接后恢复。尚无近期活动的会话显示空态。API 未提供的历史元数据不推测。

这是 **Lancer 会话/车道监视器**，不是操作系统 PID/CPU 管理器；tail 是每秒快照，不承诺捕获每个 token。它只调用现有 `lancer-ctl sessions --json` 和 `tail --json`，经同一个 [local control API](lancer-control-api.md) 读取桌面拥有的会话，不直接读写历史文件、不创建另一套会话系统。面板没有发送、停止或删除入口。

## 安全边界

服务仅监听 `127.0.0.1`，使用每次启动随机生成的只读 URL 能力路径，并校验 Host / Origin，拒绝跨站访问，不提供 CORS。桌面的 `control.token` 仅由既有 CLI 使用，永不发送到浏览器。页面采用 CSP，所有会话文本以纯文本渲染，不执行 Markdown/HTML。页面与 API 不缓存，URL 不作为 Referer 发送。

URL 仍等同于查看本机会话的能力，不要分享或转发到外网；不要将端口通过反向代理公开。自然语言会话内容仍可能包含敏感信息，不应把截图或响应当作已脱敏的公开材料。服务不额外保存 transcript。

## 验证

```sh
node --test scripts/lancer-ctl-dash.test.mjs scripts/lancer-ctl.test.mjs
pnpm exec eslint scripts/lancer-ctl-dash.mjs scripts/lancer-ctl-dash.test.mjs scripts/lancer-ctl-dashboard/dashboard.js
pnpm exec prettier --check scripts/lancer-ctl-dash.mjs scripts/lancer-ctl-dash.test.mjs scripts/lancer-ctl-dashboard/ docs/lancer-ctl-dashboard.md
```

单测使用隔离 Unix socket 验证原 CLI 的认证及只读 wire 请求、URL/Host/Origin/method 边界、原始工具参数不转发、长文本上限、错误恢复和启动参数。可见浏览器验收：启动面板，确认多条 running 会话，选择一条正在工作车道，观察 Live / Tail 时间与工具条目更新；再切换会话、筛选状态并返回全部。此功能不修改 Electron 页面或 conversation runtime。
