import { createLightLayer, svgElement } from "../dist/index.js";
const $ = (selector) => document.querySelector(selector);
const layer = createLightLayer();
const sessions = [
  {
    id: "research",
    title: "竞品调研",
    color: "#2789c3",
    model: "gpt",
    question: "对比两款 AI 编程工具，整理值得借鉴的体验。",
    result: "对话保持连续，工具过程按需展开，交付物提供独立入口。",
  },
  {
    id: "github",
    title: "GitHub 研究",
    color: "#8660cf",
    model: "claude",
    question: "研究一个开源项目，整理架构和可复用的设计。",
    result: "提取事件驱动的动效层，保留语义节点，避免复制整个应用。",
  },
  {
    id: "paper",
    title: "论文筛选",
    color: "#29a183",
    model: "gemini",
    question: "筛选 Agent 记忆论文，整理结论与阅读清单。",
    result: "按问题组织论文，把结论、来源和复用条件一起保存。",
  },
];
let mode = "fork",
  focused = false,
  active = "research",
  epoch = 0,
  running = false,
  index = 0;
const nodes = new Map(),
  links = [],
  flights = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function runningBorder(bubble) {
  const svg = svgElement("svg", { class: "light-running-border", "aria-hidden": "true" });
  svg.append(
    svgElement("rect", {
      x: 1,
      y: 1,
      width: "calc(100% - 2px)",
      height: "calc(100% - 2px)",
      rx: 13,
      pathLength: 100,
    }),
  );
  bubble.append(svg);
  return () => svg.remove();
}
function renderTree() {
  const visible = sessions.filter(
    (s) => (!focused || s.id === active) && [...nodes.values()].some((n) => n.session.id === s.id),
  );
  const tree = $("#tree"),
    scroll = $("#tree-scroll");
  const width = Math.max(scroll.clientWidth, visible.length * 180);
  const maxRow = Math.max(
    0,
    ...[...nodes.values()].filter((n) => visible.includes(n.session)).map((n) => n.row),
  );
  tree.style.width = `${width}px`;
  tree.style.height = `${Math.max(scroll.clientHeight, 110 + maxRow * 58)}px`;
  tree.querySelectorAll(".tree-name,.node-label").forEach((n) => n.remove());
  visible.forEach((s, i) => {
    const label = document.createElement("span");
    label.className = "tree-name";
    label.textContent = s.title;
    label.style.cssText = `left:${((i + 0.5) * width) / visible.length - 35}px;--light-color:${s.color}`;
    tree.append(label);
  });
  for (const n of nodes.values()) {
    const col = visible.indexOf(n.session);
    n.element.hidden = col < 0;
    if (col < 0) continue;
    n.x = ((col + 0.5) * width) / visible.length + (n.branch === 1 ? -48 : n.branch === 2 ? 48 : 0);
    n.y = 70 + n.row * 58;
    Object.assign(n.element.style, { left: `${n.x}px`, top: `${n.y}px` });
    if (n.kind === "delivery" || n.kind === "merge") {
      const label = document.createElement("span");
      label.className = "node-label";
      label.textContent = n.label;
      Object.assign(label.style, { left: `${n.x + 14}px`, top: `${n.y - 6}px`, width: "90px" });
      tree.append(label);
    }
  }
  $("#edges").replaceChildren();
  for (const [from, to] of links) {
    const a = nodes.get(from),
      b = nodes.get(to);
    if (!a || !b || a.element.hidden || b.element.hidden) continue;
    $("#edges").append(
      svgElement("path", {
        d: `M ${a.x} ${a.y} C ${a.x} ${a.y + 28} ${b.x} ${b.y - 28} ${b.x} ${b.y}`,
        fill: "none",
        stroke: b.session.color,
        "stroke-width": 1.2,
        "stroke-dasharray": a.branch === b.branch ? "" : "3 4",
      }),
    );
  }
  $("#counts").textContent = `${visible.length} 会话 · ${nodes.size} 节点`;
}
function message(session, text, user = false) {
  const bubble = document.createElement("article");
  bubble.className = `message${user ? " user" : ""}`;
  bubble.style.setProperty("--light-color", session.color);
  if (!user) {
    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("strong");
    name.textContent = "Lancer";
    const model = document.createElement("span");
    model.textContent = `${session.title} · ${session.model.toUpperCase()}`;
    meta.append(name, model);
    bubble.append(meta);
  }
  const p = document.createElement("p");
  p.textContent = text;
  bubble.append(p);
  $("#messages").append(bubble);
  $("#messages").scrollTop = $("#messages").scrollHeight;
  return bubble;
}
function addNode(session, event, bubble) {
  const id = `${session.id}:${event.key}`,
    element = document.createElement("button");
  element.className = "node";
  element.dataset.state = "pending";
  element.dataset.kind = event.kind ?? "step";
  element.dataset.event = event.key;
  element.style.setProperty("--light-color", session.color);
  element.setAttribute("aria-label", `${session.title}：${event.text}`);
  element.title = event.text;
  element.addEventListener("click", () =>
    bubble.scrollIntoView({ block: "center", behavior: "smooth" }),
  );
  const n = {
    id,
    session,
    element,
    row: event.row,
    branch: event.branch ?? 0,
    kind: event.kind,
    label: event.label ?? event.text,
  };
  nodes.set(id, n);
  $("#tree").append(element);
  for (const parent of event.parents ?? []) links.push([`${session.id}:${parent}`, id]);
  renderTree();
  const scroll = $("#tree-scroll");
  scroll.scrollTop = Math.max(0, n.y - scroll.clientHeight + 95);
  if (sessions.length === 1 || focused) scroll.scrollLeft = 0;
  else scroll.scrollLeft = Math.max(0, n.x - scroll.clientWidth / 2);
  return element;
}
async function step(session, event, ownEpoch) {
  if (ownEpoch !== epoch) return;
  active = session.id;
  document
    .querySelectorAll("[data-model]")
    .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.model === session.model)));
  const bubble = message(session, event.text);
  const stopBorder = runningBorder(bubble);
  const target = addNode(session, event, bubble);
  const speed = Number($("#speed").value),
    duration = 1200 / speed;
  const handles = [bubble, $(`[data-model="${session.model}"]`)].map((source, i) =>
    layer.emit({
      id: `event-${++index}`,
      source,
      target,
      color: session.color,
      duration,
      sourceKind: i ? "model" : "message",
    }),
  );
  handles.forEach((h) => flights.add(h));
  const results = await Promise.all(handles.map((h) => h.finished));
  stopBorder();
  if (ownEpoch !== epoch) return;
  target.dataset.state = results.some((r) => r === "cancelled") ? "pending" : "arrived";
  if (event.kind === "delivery") {
    const link = document.createElement("a");
    link.className = "delivery";
    link.textContent = `↓ ${session.title}.md`;
    // The downloaded file is an explicit demonstration deliverable, never a claimed research result.
    link.href = `data:text/markdown;charset=utf-8,${encodeURIComponent(`# ${session.title}（演示文件）\n\n${session.result}\n\n这是交互动效示例，不是模型实际研究结果。\n`)}`;
    link.download = `${session.title}-演示.md`;
    bubble.append(link);
  }
  await sleep(350 / speed);
}
async function scenario(session, ownEpoch) {
  message(session, session.question, true);
  await step(session, { key: "start", row: 0, text: "开始整理资料，先确认范围。" }, ownEpoch);
  if (mode === "single") {
    await step(
      session,
      { key: "read", row: 1, parents: ["start"], text: "资料已整理，正在核对关键结论。" },
      ownEpoch,
    );
    await step(
      session,
      {
        key: "end",
        row: 2,
        parents: ["read"],
        kind: "delivery",
        label: "交付已保存",
        text: session.result,
      },
      ownEpoch,
    );
  } else {
    await step(
      session,
      { key: "fork", row: 1, parents: ["start"], text: "分成两项并行检查：来源核验与体验分析。" },
      ownEpoch,
    );
    await Promise.all([
      step(
        session,
        { key: "a", row: 2, branch: 1, parents: ["fork"], text: "来源核验完成，已保留出处。" },
        ownEpoch,
      ),
      step(
        session,
        { key: "b", row: 2, branch: 2, parents: ["fork"], text: "体验分析完成，已整理改进点。" },
        ownEpoch,
      ),
    ]);
    await step(
      session,
      {
        key: "merge",
        row: 3,
        parents: ["a", "b"],
        kind: "merge",
        label: "分支已汇合",
        text: "两项结果已汇合，正在整理交付。",
      },
      ownEpoch,
    );
    await step(
      session,
      {
        key: "end",
        row: 4,
        parents: ["merge"],
        kind: "delivery",
        label: "交付已保存",
        text: session.result,
      },
      ownEpoch,
    );
  }
}
function reset() {
  epoch++;
  running = false;
  flights.forEach((f) => f.cancel());
  flights.clear();
  layer.destroy();
}
// Reuse one live layer through resets; a separate public method also demonstrates cleanup.
function clear() {
  epoch++;
  running = false;
  flights.forEach((f) => f.cancel());
  flights.clear();
  nodes.clear();
  links.length = 0;
  $("#tree")
    .querySelectorAll(".node,.tree-name,.node-label")
    .forEach((n) => n.remove());
  $("#edges").replaceChildren();
  $("#messages").replaceChildren();
  layer.resume();
  document.body.classList.remove("light-motion-paused");
  $("#pause").textContent = "暂停动效";
  $("#pause").disabled = true;
  $("#run").disabled = false;
  document.querySelectorAll("[data-scenario]").forEach((b) => (b.disabled = false));
  $("#status").textContent = "准备就绪";
  $("#graph-status").textContent = "等待开始";
  renderTree();
}
$("#run").addEventListener("click", async () => {
  if (running) return;
  clear();
  running = true;
  $("#run").disabled = true;
  $("#pause").disabled = false;
  document.querySelectorAll("[data-scenario]").forEach((b) => (b.disabled = true));
  $("#status").textContent = "演示进行中";
  $("#graph-status").textContent = "跟随新节点";
  const ownEpoch = epoch;
  await Promise.all(
    (mode === "parallel" ? sessions : [sessions[0]]).map((s) => scenario(s, ownEpoch)),
  );
  if (ownEpoch !== epoch) return;
  running = false;
  $("#run").disabled = false;
  $("#pause").disabled = true;
  $("#status").textContent = "交付完成";
  $("#graph-status").textContent = "全部节点已保存";
  document.querySelectorAll("[data-scenario]").forEach((b) => (b.disabled = false));
});
$("#pause").addEventListener("click", () => {
  if (layer.paused) layer.resume();
  else layer.pause();
  document.body.classList.toggle("light-motion-paused", layer.paused);
  $("#pause").textContent = layer.paused ? "继续动效" : "暂停动效";
});
$("#reset").addEventListener("click", clear);
document.querySelectorAll("[data-scenario]").forEach((b) =>
  b.addEventListener("click", () => {
    clear();
    mode = b.dataset.scenario;
    $("#scenario-title").textContent = b.querySelector("span").textContent;
    document
      .querySelectorAll("[data-scenario]")
      .forEach((button) => button.setAttribute("aria-pressed", String(button === b)));
  }),
);
for (const [selector, value] of [
  ["#focus", true],
  ["#all", false],
])
  $(selector).addEventListener("click", () => {
    focused = value;
    $("#focus").setAttribute("aria-pressed", String(value));
    $("#all").setAttribute("aria-pressed", String(!value));
    renderTree();
  });
document.querySelectorAll("[data-model]").forEach((button) =>
  button.addEventListener("click", () => {
    if (running) return;
    const session = sessions.find((s) => s.id === active) ?? sessions[0];
    session.model = button.dataset.model;
    document
      .querySelectorAll("[data-model]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  }),
);
const resize = new ResizeObserver(renderTree);
resize.observe($("#tree-scroll"));
window.addEventListener("pagehide", () => {
  reset();
  resize.disconnect();
});
