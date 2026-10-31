// Extract only the supplied prototype's declarative fixture and light CSS. No prototype
// HTML, JavaScript renderer, iframe, or reference-video pixels are shipped to the app.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import vm from "node:vm";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const source = await readFile(resolve(root, ".lancer-task/refs/prototype.html"), "utf8");
const between = (start, end) =>
  source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const code =
  between("const ICONS=", "const qs=") +
  between("const A=", "const ic=") +
  between("const EV=", "const TN=") +
  "const E_=(l,lb)=>EV.find(e=>e.l===l&&e.lb===lb);\n" +
  between("const CONV=", "const durOf=") +
  "globalThis.data={ICONS,A,EV,CONV};";
const context = { data: null };
vm.runInNewContext(code, context);
const { ICONS, A, EV, CONV } = context.data;
const attr = (text) =>
  Object.fromEntries(
    [...text.matchAll(/([\w-]+)="([^"]*)"/g)]
      .filter(([_, key]) => key !== "xmlns")
      .map(([_, key, value]) => [key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value]),
  );
const icons = Object.fromEntries(
  Object.entries(ICONS).map(([key, svg]) => [
    key,
    {
      attributes: attr(svg.match(/<svg([^>]*)>/)[1]),
      parts: [...svg.matchAll(/<(path|circle|rect|line|polyline)([^>]*)\/?\s*>/g)].map((m) => ({
        tag: m[1],
        attributes: attr(m[2]),
      })),
    },
  ]),
);
const lanes = [
  { id: "v", name: "视频学习", color: "#3B82F6", relay: ["doubao", "grok", "grok+opus", "codex"] },
  { id: "r", name: "外网调研", color: "#8B5CF6", relay: ["x", "grokbot", "codex"] },
  { id: "l", name: "Lancer", color: "#10B981", relay: ["sol", "opus", "you"] },
  { id: "x", name: "小红书", color: "#DB2777", relay: ["kimi", "sol", "you"] },
];
const actors = Object.entries(A).map(([id, actor]) => ({
  id,
  name: actor.n,
  short: actor.s,
  badge: actor.bd,
  icon: actor.ic,
}));
const session = (id, actor, title, branch, status = "") => ({ id, actor, title, branch, status });
const sidebar = [
  {
    name: "视频学习",
    count: "2/5",
    sessions: [
      session("v1", "doubao", "豆包 · 下载抖音视频", "wt/douyin-dl", "done"),
      session("v2", "grok", "Grok · 看片抽关键帧", "wt/douyin-watch", "run"),
      session("v3", "grok+opus", "Grok+Opus · 讨论沉淀学习卡片", "wt/douyin-learn", "q"),
      session("v4", "codex", "Codex · 生成示范视频", "wt/douyin-render", "q"),
    ],
  },
  {
    name: "外网调研",
    count: "2/4",
    sessions: [
      session("r1", "x", "X · 搜集动画方向优质帖", "wt/web-collect", "done"),
      session("r2", "grokbot", "Grok Bot · 总结可借鉴做法", "wt/web-digest", "hand"),
      session("r3", "codex", "Codex · 实现动效 demo", "wt/motion-demo", "q"),
    ],
  },
  {
    name: "Lancer",
    count: "2 个会话",
    sessions: [
      session("l1", "sol", "Sol · session-store 增量持久化", "wt/main", "done"),
      session("l2", "opus", "Opus · 审查：并发写入竞争", "wt/review", "done"),
    ],
  },
  {
    name: "小红书",
    count: "2 个会话",
    sessions: [
      session("x1", "kimi", "Kimi · 选题周报 · 10 月第 4 周", "wt/xhs-notes"),
      session("x2", "astra", "Astra · 封面文案 A/B", "wt/xhs-cover"),
    ],
  },
];
const events = EV.map((e) => ({
  id: `ev${e.i}`,
  index: e.i,
  time: e.t,
  lane: e.l,
  kind: e.ty,
  actor: e.a,
  label: e.lb,
  summary: e.sm,
  ...(e.br ? { branch: true } : {}),
  ...(e.fail ? { fail: true } : {}),
  ...(e.b ? { targetActor: e.b } : {}),
  ...(e.to ? { retryTarget: `ev${EV.find((x) => x.l === e.l && x.lb === e.to).i}` } : {}),
  ...(e.src ? { reference: `ev${EV.find((x) => x.lb === e.src).i}` } : {}),
  ...(e.res ? { waitDuration: e.res } : {}),
  hash: ((e.i * 2654435761) >>> 0).toString(16).slice(0, 7),
}));
const messages = Object.fromEntries(
  Object.entries(CONV).map(([lane, list]) => [
    lane,
    list
      .filter((b) => b.at !== undefined)
      .map((b, index) => ({
        id: b.id ?? `${lane}-message-${index}`,
        kind: b.ev ? "event" : b.a ? "assistant" : "user",
        time: b.at,
        ...(b.ev ? { eventId: b.id } : {}),
        ...(b.a ? { actor: b.a } : {}),
        ...(b.tx ? { text: b.tx } : {}),
        ...(b.done ? { completed: true } : {}),
        ...(b.thr ? { replies: b.thr } : {}),
        ...(b.card ? { card: b.card } : {}),
        ...(b.steps
          ? {
              steps: b.steps.map((step, i) => ({
                id: `s${b.id}_${i}`,
                kind: step[0],
                label: step[0] === "think" ? `思考了 ${step[1]}` : step[1],
                duration: step[0] === "think" ? step[1] : step[2],
                detail: step[0] === "think" ? step[2] : step[3],
              })),
            }
          : {}),
      })),
  ]),
);
const data = {
  actors,
  icons,
  lanes,
  sidebar,
  reel: [
    "doubao",
    "grok",
    "opus",
    "x",
    "grokbot",
    "codex",
    "sol",
    "astra",
    "luna",
    "gemini",
    "kimi",
  ],
  events,
  messages,
  titles: {
    v: { title: "Grok · 看片抽关键帧", branch: "wt/douyin-watch" },
    r: { title: "Codex · 实现动效 demo", branch: "wt/motion-demo" },
    l: { title: "Sol · 重构 session-store", branch: "wt/refactor" },
    x: { title: "Sol · 本周文案", branch: "wt/xhs-notes" },
  },
};
const directory = resolve(root, "apps/desktop/src/features/conversation/lancer-process");
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, "replay-fixture.ts"),
  `// Declarative demonstration data extracted from the user-supplied prototype.html.\n// Event hashes are prototype fixture labels, never Git/runtime evidence.\n// Model icons: Lobe Icons v1.99.0, MIT; trademarks belong to their owners.\nimport type { ProcessFixture } from "./process-types";\nexport const REPLAY_FIXTURE: ProcessFixture = ${JSON.stringify(data, null, 2)};\n`,
);
await writeFile(
  resolve(root, ".lancer-task/out/reference-data.json"),
  JSON.stringify(data, null, 2),
);
const css = between("<style>", "</style>").slice(7);
const used = new Set(
  "tbar tdots brand reel mask trk it lens tright ctl spd tgl mono mu ok pu bl ic bd pair dot run done hand q smp rtk stp arr body ml side sh search lst ft main cmp composer ph row send foot lb avs av2 on sz szh ssr t w strip4 lr zl ar agc ck wait rp2 rh lh lhc n a p s fbar r nd nl g gc gd gr2 gt x gs ga gtl gw gh gx ge gy gf gk gg lgd h li cv cvh tg cc um am who tx rx thr thb eh cv2 op gl ti mt lt hl pend eb sgp slst srw k d sdt th fc fi op2 hp kfs opt dim merge-glyph".split(
    " ",
  ),
);
const cssRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((match) => {
  let selector = match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (selector === ":root,[data-theme=light]" || selector === ":root")
    return [`:scope{${match[2]}}`];
  if (selector === "body") return [`:scope{${match[2]}}`];
  if (selector === "*") return [`*{${match[2]}}`];
  if (selector === "button" || selector.startsWith("button.") || selector.startsWith("button:"))
    return [`${selector}{${match[2]}}`];
  if (selector.startsWith("kbd")) return [`${selector}{${match[2]}}`];
  if (selector.startsWith(".app")) return [`:scope{${match[2]}}`];
  selector = selector
    .replace(/#tz/g, ".process-tree-viewport")
    .replace(/#tip/g, ".process-event-tip")
    .replace(/#ov/g, ".process-flight-canvas");
  const first = /^\.([\w-]+)/.exec(selector)?.[1];
  if (first && (used.has(first) || first.startsWith("process-")))
    return [`${selector}{${match[2]}}`];
  return [];
});
const overrides = `
  :scope { font-family: var(--sans); font-size: 13px; line-height: normal; color: var(--tx); background: var(--bg); }
  .process-tree-viewport { overflow: auto; scrollbar-width: none; }
  .process-tree-viewport::-webkit-scrollbar { display: none; }
  .process-tree-space { position: relative; min-height: 100%; }
  .process-tree-space > svg { position: absolute; inset: 0; pointer-events: none; }
  .process-flight-canvas { display: block; }
  button.eh, button.sgp, button.srw, button.thr { border: 0; background: transparent; border-radius: 0; height: auto; width: 100%; text-align: left; justify-content: flex-start; line-height: normal; }
  button.eh { border-radius: 6px; padding: 5px 8px; width: calc(100% + 16px); font-size: 12.5px; }
  button.eh:hover { background: var(--bg2); }
  button.sgp { padding: 2px 0; font-size: 12px; }
  button.srw { padding: 3px 0; font-size: 12px; }
  button.thr { padding: 0; margin-top: 5px; font-size: 11.5px; }
  button.ssr { width: 100%; height: auto; border: 0; border-left: 2px solid transparent; border-radius: 0; text-align: left; background: transparent; }
  button.av2 { padding: 0; }
  .process-stage { animation: none; border: 0; background: none; padding: 0; margin: 0; }
  .am { padding: 0; font-size: inherit; line-height: normal; }
  .am .tx { white-space: normal; }
  .process-stage__status { border: 0; background: none; width: 14px; height: 14px; border-radius: 0; }
  .pending-glyph { width: 11px; height: 11px; border-radius: 50%; border: 1.5px dashed var(--lc); }
  .process-stage__title { font-weight: 400; }
  .merge-glyph { width: 11px; height: 11px; box-shadow: 0 0 0 2px var(--bg), 0 0 0 3.5px var(--lc); }
  .process-handoff { margin: 0; }
  .op2 { padding: 0; border: 0; height: auto; background: none; }
  .process-tree-space .nd { border: 0; padding: 0; background: transparent; border-radius: 0; height: auto; }
  .process-tree-space .nl { border: 0; background: transparent; padding: 0; margin: 0; }
  .process-stage__body { opacity: 1; }
  .process-surface-composer { display: block; }
  .process-demo-input { border: 0; padding: 0; resize: none; height: 22px; min-height: 22px; background: transparent; width: 100%; font: inherit; font-size: 13px; color: var(--tx); outline: none; }
  .process-demo-input::placeholder { color: var(--tx3); }
  .process-conversation-surface { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
  .cv { scrollbar-width: none; }
  .cv::-webkit-scrollbar { display: none; }
  .szh { min-height: 26px; }
  .ssr .t { line-height: 20px; }
  .lhc { padding-bottom: 8px; }
  .ssr .w { line-height: 12px; }
  .process-conversation-items--lane button.eh { line-height: 19px; }
  .process-conversation-items--lane .eb { padding-top: 6px; }
  .composer .process-demo-input { display: block; min-height: 22px; line-height: 22px; }
  .cvh { min-height: 38px; }
  .process-tree-space > svg { width: 100%; height: 100%; }
  .process-stage--hl { box-shadow: none; background: transparent; border-radius: 0; }
  .tbar { -webkit-app-region: drag; }
  .tbar button, .topbar__actions, .reel { -webkit-app-region: no-drag; }
  .process-conversation-items { position: relative; }
  &.lancer-process--tools .rp2 { display: none; }
  &.lancer-process--tools .body.ml { grid-template-columns: 232px minmax(0, 1fr) minmax(500px, var(--workbench-width, 52%)); }
  .process-tool-panel { min-width: 0; display: flex; }
  .process-tool-panel > .workbench { width: 100%; min-width: 0; flex: 1; }
  .process-assistant:hover .timeline-item__actions { opacity: 1; transform: none; }
  .process-relay-step { display: contents; }
  button.zl { padding: 0; border: 0; border-radius: 0; height: auto; color: inherit; background: transparent; }
  button.lhc { height: auto; border: 0; border-right: 1px solid var(--line); border-radius: 0; text-align: left; align-items: normal; background: transparent; }
  button.lhc:last-child { border-right: 0; }
  .search input { flex: 1; width: 0; min-width: 0; border: 0; outline: none; background: transparent; color: var(--tx); font: inherit; }
  .search input::placeholder { color: var(--tx3); }
  .process-new-thread { width: 28px; height: 28px; justify-content: center; padding: 0; }
  .process-conversation-items > [data-message-id] { display: flow-root; }
  .process-reel-button { border: 0; padding: 0; background: transparent; }
  .reel .lens { pointer-events: none; }
  .ctl button { height: 26px; min-height: 26px; border-radius: 6px; }
`;
await writeFile(
  resolve(directory, "process-surface.css"),
  `/* Light-only values and geometry transcribed from the supplied prototype. */\n@scope (:root:not(.dark) .lancer-process) {\n${cssRules.join("\n")}\n${overrides}\n}\n`,
);
console.log(
  `Extracted ${events.length} events, ${Object.values(messages).flat().length} messages, ${Object.keys(icons).length} icons, ${cssRules.length} light style rules`,
);
