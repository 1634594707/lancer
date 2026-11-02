# 用户视角问题验证报告（2026-11-02）

验证环境：Windows 10 (10.0.26300) x64，`pnpm dev` 源码启动，Playwright Electron 驱动真实 UI（`testMode: background`，真实 provider `cc/deepseek-v4.1-flash`）。测试脚本为临时 spec（已删除），证据保留在 `.artifacts/queue-stop-repro/`、`.artifacts/playwright/` 与临时 userData 目录。

图例：✅ 实测复现 · ⚠️ 部分修正 · 📖 代码级证实（未做故障注入实测）

---

## #7 停止后排队消息界面不清空 ✅（本次最重要发现，复现 ×4）

**用户报告**：停止后三条排队消息仍显示。**实测确认，且比原判断更严重。**

**实测数据**（真实 provider，运行中排队 2 条 → 点 Stop）：

| 观测点                                          | 结果                                                         |
| ----------------------------------------------- | ------------------------------------------------------------ |
| pi 会话 JSONL（运行时）                         | `queued-one/two` **从未投递**，停止后无任何新消息 ✓ 数据安全 |
| 主进程镜像（`getState()` pull，停止后立即）     | `queue: 0` —— 镜像已清空                                     |
| 渲染进程 DOM（停止后 20s+）                     | `queued-composer-message` 计数 = **2**，持续不清             |
| 渲染进程收到的 `stateChanged` 推送（15s 窗口）  | **0 条**                                                     |
| 停止后重新 `selectSession`（触发全新 IPC 响应） | 队列**仍是 2** —— 新响应也带旧值                             |

**结论**：数据层正确（消息不会重复投递），纯 UI 状态陈旧缺陷。用户会误以为"停止没生效/消息还会发出"。

**机制定位**（代码链路）：

1. app-store 订阅驱动事件只做**入队**（`enqueueSessionEvent`，`apps/desktop/electron/application/app-store.ts:2915-2917`），驱动 `emit` await 的是入队动作本身；
2. 取消 IPC 的响应在 `store.emit()`（`apps/desktop/electron/conversation/app-store-composer.ts:666`）构建时，FIFO 里的 `handleSessionEvent` 尚未清镜像 → **响应携带旧队列**；
3. `this.state.queuedComposerMessages` **字段**只在 `refreshState`/会话选择构建时重算（`app-store.ts:742/2556/3798`），镜像清空后字段不更新，后续发布同样带旧值；
4. 停止后 15-20s 内渲染进程未收到任何 `stateChanged` 推送，陈旧状态无法被纠正。

**修复方向**：取消路径同步重算 `state.queuedComposerMessages` 字段（或响应构建前强制刷新该字段）；并排查停止后推送缺失的原因。

---

## #2 New thread 输入不持久 ✅

**实测**：Ctrl+N → 输入 `persist-me` → Ctrl+,（设置）→ Ctrl+N 返回 → 输入框为 `""`。

**根因**：`src/features/threads/hooks/use-new-thread-controller.tsx:69` `const [prompt, setPrompt] = useState("")` 为纯组件状态，切视图卸载即丢（会话草稿有 350ms 防抖持久化，此处没有）。

---

## #3 English 语言下硬编码中文 ✅

**实测**（测试模式强制 `en` locale）footer 实抓文本：

- `"本地工作区6 个模块 · 1 个会话"`
- 轨迹图例整条中文：`提交/保存 交接 · 无损 检查点 ✓测试 ✓ ✕测试 ✕ 审查通过 分叉 合并 产物 工具调用 模型切换 上下文压缩 等待你 跨线引用 错误 ↻重试`
- `"RECENTLY HERE1 个会话 · 0 条分支 · 已就绪"`

**代码位置**（此前静态扫描）：zone 标签 `contracts/lancer-zones.ts:24-43`；footer `src/features/threads/sidebar.tsx:731-733`；模型搜索框 `src/features/conversation/model-reel.tsx:129-130`；视频栏 `src/features/conversation/video-learn-bar.tsx:78-110`；豆包整套 UI、pi-orb（`src/pi-orb/orb.ts:27-209`）、主进程报错（`electron/orchestration/task-limits.ts:21,44,73-95`）均绕过 i18n。

---

## #4 Windows 平台缺口 ⚠️（含一处修正）

- **应用菜单（修正）**：`main.ts:725-727` 非 darwin 早退，应用**未安装自定义菜单**；实测 `Menu.getApplicationMenu()` 返回 **4 项 = Electron 默认菜单**（File/Edit/View/Window），Alt 唤起的是它。原文"菜单里没有这一项"表述成立，但"完全无菜单"不准确。
- **通知设置跳转** 📖：`electron/platform/notification-permission.ts:269-274` 非 darwin 打开 Apple 支持网页（未实测点击，避免开浏览器；代码无歧义）。
- **Ctrl+Shift+N 开新窗口**：代码证实（`main.ts:565-569`），菜单中无对应项（菜单未装）。
- **本地控制服务** 📖：`electron/control/control-server.ts:104-105` win32 抛 `E_UNSUPPORTED`，启动失败被吞（`main.ts:1055-1057`）。
- **终端 shell placeholder** 📖：`settings-general-section.tsx:110` 硬编码 `/bin/zsh`，实际默认 `cmd.exe`（`terminal-service.ts:493-501`）；`composer.ts:147/296` 硬编码 `Cmd+,`。

---

## #5 主窗口不记忆位置/尺寸 ✅

**实测**：移动至 `{80,80,1000×700}` → 退出 → 重启后 `{220,26,1480×980}`（硬编码默认值，`main.ts:440-444`，无 bounds 持久化）。对照：悬浮 orb 位置反而持久化（`pi-orb-window.ts:18`）。

---

## #6 搜索性能 📖（未做长会话实测）

- 搜索模式绕过虚拟化全量挂载：`use-timeline-viewport.ts:170` `searchMode ? layout : visibleRows(...)`
- 搜索是同步 DOM TreeWalker 全文本扫描：`use-thread-search.ts:44`
- 侧边栏搜索只匹配标题+分支名（`sidebar.tsx:640-646`），无跨会话内容搜索。

需要长会话（数百条消息）帧率实测才能量化，本轮未做。

---

## #1 操作失败静默 / 草稿丢失风险 📖

- 无 toast 系统；会话归档/置顶/重命名失败仅 `console.error`（`use-thread-actions.ts:103-108`）；设置类失败同（`secondary-surfaces.tsx` 20+ 处）。
- 草稿持久化失败完全静默（`use-composer-draft-sync.ts:126-128`，rejection 只从 in-flight 表删除）。
- 350ms 防抖窗口内杀进程丢草稿：机制存在（`use-composer-draft-sync.ts:167-173`），未做精确时序实测。

---

## #8 崩溃恢复无继续入口 ✅

**实测**：真实运行中 SIGKILL → 重启：

- 落盘 catalog 中会话状态为 `idle`（崩溃时的 running 被静默重置，`session-supervisor.ts:2596,445` 的 `?? "idle"` 路径）
- transcript 停在中途（JSONL 末尾为 3 次 auto-retry error，无完成记录）
- 全仓库无任何 resume/继续运行逻辑（代码扫描确认），UI 无恢复入口
- 附注：SIGKILL 后 Playwright `electron.launch` 重启失败 3 次，但**手动启动同 profile 成功**（档案未损坏），属测试环境问题而非应用缺陷。

---

## 修复优先级建议

| 优先级 | 事项                                        | 依据                        |
| ------ | ------------------------------------------- | --------------------------- |
| P0     | #7 停止后队列 UI 陈旧（含推送缺失排查）     | 实测复现 ×4；误导用户操作   |
| P0     | #2 New thread 输入不持久                    | 实测复现；直接数据丢失体感  |
| P1     | #3 i18n 收编 + `Cmd+,`、`/bin/zsh` 平台标签 | 实测复现；发布门面          |
| P1     | #5 主窗口 bounds 持久化                     | 实测复现；每日重启都撞      |
| P1     | #4 通知设置跳转 / 基础应用菜单（Windows）   | 代码级；低成本              |
| P2     | #1 失败反馈（toast 层）+ 草稿写入失败提示   | 代码级；触发条件较窄        |
| P2     | #6 搜索长会话性能（先做帧率实测再定方案）   | 代码级                      |
| P2     | #8 崩溃后"继续上次运行"入口                 | 代码级 + 落盘证据；产品决策 |

---

## 修复状态（2026-11-02 修复分支）

分支 `fix/verified-issues-2026-11-02` 修复了 P0 与 P1 五项；P2 三项保持未修。

### #7 停止后队列 UI 陈旧 — 已修复

- 根因确认：队列字段是由 per-session 镜像派生的状态，但 `emit()` 与 `selectSessionFast()` 直接返回上一次发布的字段；而取消响应在 `driver.cancelCurrentRun()` 之后立刻构建，此时会话事件 FIFO 尚未处理 `sessionUpdated`，镜像仍是旧队列。
- 修复：新增 `electron/application/selected-session-projection.ts`，`emit()`、`refreshState()`、`syncDerivedSessionState()` 与 `selectSessionFast()` 统一从镜像重算 `queuedComposerMessages` / `editingQueuedMessageId`；取消路径在拿到 driver 结果后立即把镜像清空（`updateQueuedComposerMessages(sessionRef, [])`），不再等待事件队列。
- 覆盖：`tests/unit/selected-session-projection.spec.ts`（镜像已清空时快照不得残留队列）、`tests/unit/transcript-source-identity.spec.ts`（Stop 路径必须同步清镜像）。

### #2 New thread 输入不持久 — 已修复

- 根因确认：`useNewThreadController` 的 state 挂在不会卸载的 App 上，真正清空输入的是 `openSurface()` 无条件调用的 `resetSurface()`。
- 修复：`openSurface()` 先解析目标 workspace；与当前 surface 相同（例如从设置按 Ctrl/Cmd+N 返回）时保留 prompt、附件与模型选择，只有切换 workspace 或发送成功后才清空。
- 覆盖：`tests/core/new-thread-composer.spec.ts` 新增「草稿跨设置页保留」用例。

### #3 English 环境下硬编码中文 — 门面部分已修复

- zone 标签：`LancerSessionZone` 增加 `labelKey`，侧边栏、模块列表、lane 概览与「常态会话」入口按当前语言渲染；用户改过名的模块仍显示保存的名称（模块图标改按 id 匹配，避免翻译后丢图标）。
- 侧边栏 footer、最近会话、过程面板状态与 footer、模型搜索/数量、视频栏、轨迹图例（`process-tree.tsx` 与多 lane 面板）全部走 `t()`。
- `Cmd+,` 改为按平台显示（macOS `Cmd+,`，Windows/Linux `Ctrl+,`）；设置页 shell 占位符改用与 `terminal-service` 共享的 `defaultTerminalShell()`（win32 `cmd.exe`、macOS `/bin/zsh`、其他 `/bin/bash`）。
- 主进程任务限额报错改走 `t()`，单元测试改为断言英文文案以脱钩具体语言。
- 未收编：豆包 UI、pi-orb、lancer-process 其余原型文案（按约定留待后续）。

### #4 Windows 平台缺口 — 已修复（不含本地控制服务）

- `installApplicationMenu()` 不再在非 darwin 早退：Windows/Linux 也安装 File/Edit/View/Window 菜单，仅 macOS 专有的 role（app 菜单、services、hide、speech、front、pasteAndMatchStyle）按平台裁剪；Open Folder 改为 `CommandOrControl+O`，非 macOS 的 File 菜单额外提供 Settings 入口与 Quit。
- 通知设置跳转：win32 打开 `ms-settings:notifications`；Linux 不再跳转 Apple 支持页（无跨桌面统一 URI，改为记录警告）。
- 本地控制服务在 win32 抛 `E_UNSUPPORTED` 属平台能力限制，未在本次修改。

### #5 主窗口不记忆位置/尺寸 — 已修复

- 新增 `electron/windows/window-bounds.ts`：`normalizeWindowBounds()` 校验宽高下限、要求与任一显示器工作区至少保留 120×80 可见区域，否则回落到主屏居中；保存走 `writeFileAtomicQueued`（防抖 400ms，关闭时落盘 `getNormalBounds()` 与最大化状态）。
- 仅会话内第一个窗口拥有「记忆 + 恢复」，额外窗口保持原有层叠行为；恢复时若上次是最大化会重新最大化。
- 覆盖：`tests/unit/window-bounds.spec.ts`（离屏回落、半屏保留、最小尺寸、损坏数据、读写往返）、`tests/core/window-bounds.spec.ts`（重启后恢复尺寸，位置断言带容差）。

### 验证记录

- `pnpm --filter @lancer/desktop run typecheck` 通过。
- `pnpm check:architecture` 通过（renderer 边界、contract authority、host boundary、timeline owner）。
- 单元测试：`selected-session-projection`、`window-bounds`、`task-limits`、`lancer-trajectory-events`、`transcript-source-identity` 全通过。
- Core e2e：`app-menu`、`window-bounds`、`new-thread-composer`（新增草稿用例）、`ui-shell`、`process-replay`（图例计数）通过。
- 已知本地环境问题（与本分支无关，基线同样失败）：Windows 上 `page.screenshot` 在 background 测试模式偶发 30s 超时；`atomic-file-write`/`git-review`/`checkpoint-store` 等用例因 Windows `EPERM` 失败；`new-thread-composer` 的两个 model-onboarding 用例在基线即失败。
