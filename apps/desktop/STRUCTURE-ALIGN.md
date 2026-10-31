# 结构三条落地顺序 / Structure align (approved 2026-10-27)

用户已确认提效向三条。换 UI / skin 包 **不做** 主线。

## 0. 原则

- 主目标：改得快、冲突少、好找文件；并对准「对不齐 / 文字显示」痛点。
- 保留 Electron Pattern C：`main` / `preload` / `renderer` + contracts。
- 右树视觉像素锁（demo 布局语言）继续有效；拆分代码时勿改 chrome 外观除非单独验收。

## 1. 按域拆胖 ipc + 集中 CSS

**顺序建议（低风险 → 高收益）**

1. 盘点 `contracts/ipc.ts` 的 `desktopIpc` / commands 键，按现有 electron owner 文件夹分组列出清单（不改行为）。
2. 新建 `contracts/ipc/`（或 `contracts/<domain>-ipc.ts`），**先搬类型与常量、再搬实现引用**；`register-desktop-ipc` 只做聚合。
3. 每次 PR 只搬一个域（建议首刀：`lancer-zones` / threads 或 workbench——冲突面清晰且与壳 UI 相关）。
4. CSS：新建域旁 `*.module.css` 或 `features/<domain>/<name>.css`；从 `styles/lancer.css`、`sidebar.css`、`timeline.css` 等迁出对应块；`styles/tokens.css` 只留色板与全局 base。
5. 加/保持 architecture guard：禁止 feature 再向中央 `styles/` 堆新大段业务样式（可渐进 lint）。

**完成标准：** 两人可同时改 conversation 与 process-tree 而不抢同一 `ipc.ts` / 同一巨型 css；PR diff 自包含。

## 2. 短所有权地图压过长 plans

1. 本目录 `OWNERS.md` 进仓（建议路径：`apps/desktop/OWNERS.md` 或仓库根 `OWNERS.md`，与 pi 对齐后二选一）。
2. `lancer-relay/RULING-*`、过长 UI-SHELL 计划：**保留链接作归档**，文首加「决策以 OWNERS + 本 ALIGN 为准」。
3. PR / agent 提示：先读 OWNERS 一行再改。

**完成标准：** 「改接力树 / 改 orb / 改 zones」30 秒内能指出 renderer + ipc + electron 路径。

## 3. 布局/字体 token + 截图门禁

1. 新增 `contracts/layout.ts`、`contracts/typography.ts`（数值 + CSS 变量名），经现有 theme 应用路径写入 `:root`（与 `theme.ts` 同级纪律）。
2. 文本组件强制 token（截断、行高、字号）；禁止新魔法数字（stylelint/渐进）。
3. **皮与几何分家：** `lancer-process` 几何（`process-math`、viewport、curve anchors）与光线/orb 皮肤分文件；皮肤只读几何 API。
4. Playwright 视觉快照：空线程、长标题截断、窄窗、右侧树固定 fixture（与现有 relay-bench 对齐）；`check:visual` 与 `check:architecture` 并列。

**完成标准：** 改一处密度/字号，侧栏与 composer 一致；对齐争议变成改 token 的 PR；回归少靠人工「再往左 2px」。

## 刻意不做

- 单独 `packages/lancer-skin` 热插拔。
- 为换皮而加的抽象层。
- 把多 worktree 当成永久产品结构。

## 建议执行车道

| 步                               | 谁                                    | 备注               |
| -------------------------------- | ------------------------------------- | ------------------ |
| OWNERS + ALIGN 进 relay / 仓     | UI研究 已起草 → pi 合入               | 本文件             |
| ipc 首域拆分 PR                  | @pi（ui-shell 或独立 structure 车道） | 勿挡光线 demo      |
| CSS 域迁 + tokens                | 同车道或紧随                          | 与视觉门禁一起更稳 |
| layout/typography + visual gates | 同                                    | 对准对不齐/文字    |
| 光线可点演示                     | UI研究 mockup（进行中）               | 不阻塞结构 PR      |

## 参考

- 对照简报：`lancer-relay/lancer-agent-structure-compare.md`
- 上游模式：pi-gui `docs/architecture.md`（Host/Core + owner 表）

## 2026-10-28 会话拓扑落地

左侧固定为模块、AI 助手、会话列表；右侧固定为每个会话的 GitTree，并行分支从真实子会话记录展开。删除助手必须指定会话接收方，不能删除会话历史。实时输出与轨迹共用运行实例身份；交付先保存事件，再播放光线，重启只恢复节点。实现与验证入口见 `OWNERS.md` 及 `tests/core/lancer-assistant-parallel.spec.ts`。
