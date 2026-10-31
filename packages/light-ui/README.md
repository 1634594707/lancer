# Lancer Light UI

把 AI 执行过程连接到结果：**模型 / 对话气泡 → 同色光线 → 工作树节点**。

从 Lancer 桌面端抽出的实际渲染代码。无运行时依赖，无模型服务要求，TypeScript / 原生 SVG；可接入 React、Vue 或普通网页。示例只演示界面事件，不冒充真实 AI 任务。

## 30 秒启动

在这个独立源码目录中执行：

```sh
npm install
npm run dev
```

打开 <http://127.0.0.1:4178>，点击「开始演示」。可切换单线、分叉合并、多会话并行；可暂停、重置、聚焦、下载演示交付物。建议 Node 24；支持 Node >=22.19.0 <26。

## 接入自己的项目

本包尚未发布到 npm。先在源码目录执行 `npm pack`，再在你的项目安装生成的本地 `.tgz` 文件。**不需要安装 Lancer 或 Electron。**

```js
import { createLightLayer } from "@lancer/light-ui";

const light = createLightLayer();

// 在真实业务事件发生后调用；先把对应节点加入 DOM 并滚动到可见位置。
const flight = light.emit({
  id: "task-42:delivery:1",
  source: document.querySelector("#reply-42"),
  target: document.querySelector("#node-42"),
  color: "#2789c3", // 与这条工作树一致
});

await flight.finished; // arrived | cancelled | missing-anchor
// 页面卸载时 light.destroy()；中止单次动效时 flight.cancel()。
```

源元素和目标元素必须存在。传入具体元素或返回元素的函数，避免位置变化后保存过期坐标。需要模型图标和气泡同时发射时，调用两次 `emit`，使用不同 `id`，指定同一个目标；模型光线加 `sourceKind: "model"`。

| 参数 / 方法            | 用途                                         |
| ---------------------- | -------------------------------------------- |
| `source`、`target`     | 元素、视口坐标 `{ x, y }` 或返回它们的函数   |
| `id`                   | 每次发射唯一的业务事件 ID；运行中重复会报错  |
| `color`                | 该会话 / 分支的颜色                          |
| `duration`             | 毫秒，默认 1200；两端慢、中段快              |
| `seed`                 | 可选 `[0,1)`，固定本次轨迹；不提供时随机选择 |
| `pause()` / `resume()` | 暂停 / 继续；页面隐藏时自动暂停              |
| `destroy()`            | 取消未完成光线，移除 SVG 和监听器            |

`createLightLayer(root)` 可覆盖局部容器；容器需 `position: relative`，避免缩放变换。默认覆盖整个视口。跟随元素滚动和尺寸变化；找不到目标会返回 `missing-anchor`，不会射向附近的其他节点。最多同时 128 条光线，建议合并频繁 token 更新，在阶段变化或交付时触发。

## 流动边框

```html
<!-- 父元素 position: relative；只在执行期间挂载这段 SVG。 -->
<svg class="light-running-border" style="--light-color: #2789c3" aria-hidden="true">
  <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="12" pathLength="100" />
</svg>
```

导入 `@lancer/light-ui/running-border.css`。暂停时在父元素加 `light-motion-paused`。业务状态还应有文字提示；动效仅作补充。

## 在 React 中

在 `useEffect` 中创建图层，在 cleanup 中 `destroy()`；把实例放入 `useRef`。通过业务事件调用 `emit`，**不把每帧进度放进 React state**。开发环境 Strict Mode 会重复挂载，务必清理旧实例。底层 `renderRoute` / `updateFlight` / 几何函数也可单独使用，Lancer 正是这样接入。

## 怎么复用这个设计

直接复制 [PROMPT.md](PROMPT.md) 给你的编码助手。它描述交互规则和接入边界，适合迁移到现有 UI。小型完整示例见 [demo/app.js](demo/app.js)，分叉与合并由父节点 ID 连接，主业务决定节点保存与任务状态。

## 验证

- `npm test`：轨迹端点、单调缓动、变换与退化路径测试。
- `npm run typecheck`：严格 TypeScript 检查。
- 启动后打开 <http://127.0.0.1:4178/demo/verify.html>：真实 SVG 上的 12 项生命周期检查，包括布局变化、暂停、取消、缺失目标、独立图层和空闲清理。
- Lancer 的 Electron Core 同时运行这页验证和主应用的模型发射 / 目标节点回归。

空闲无帧循环；每次发射的轨迹固定；遵循 `prefers-reduced-motion`，减少动态效果时直接完成而不飞行。SVG 路径更新不全在合成线程上，不能承诺任意机器 / 任意并发都达到 60 FPS。应限制同时可见光线，并在目标设备测量。

MIT，见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。此仓库不包含 Lancer 的账户、CLI、聊天历史、角色头像或视频素材。

---

**English:** An event-driven SVG light layer extracted from Lancer. Run `npm install && npm run dev`, then open port 4178. No runtime dependencies or AI credentials. Use `createLightLayer().emit({ id, source, target, color })` to connect real events to their exact nodes; destroy the layer on unmount. The demo covers branching, parallel sessions, merging, delivery, and reduced-motion behavior. Not yet published to npm; use `npm pack` for local installation.
