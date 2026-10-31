import "./pi-run.css";
import "./orb.css";

type Status = "running" | "queued" | "waiting" | "done" | "failed" | "idle";
type Lane = {
  workspaceId: string;
  sessionId: string;
  title: string;
  model: string;
  status: Status;
  root: { workspaceId: string; sessionId: string };
  selected: boolean;
  stopped: boolean;
  output: string;
};
declare global {
  interface Window {
    piOrb: {
      expand(): void;
      collapse(): void;
      open(workspaceId: string, sessionId: string): void;
      onLanes(callback: (lanes: Lane[]) => void): void;
    };
  }
}
const root = document.querySelector<HTMLDivElement>("#root")!;
root.innerHTML = `<div class="pi-orb pi-glass" role="button" tabindex="0" aria-label="展开 pi 运行区"><svg class="arcs" viewBox="0 0 48 48"></svg><span class="n"></span><span class="wait" hidden></span><span class="fail"></span><span class="bdg"></span></div><section class="pi-panel pi-glass closed" aria-label="pi 运行区"><header class="pi-head"><span class="sum"><span class="st running"></span><span class="summary"></span></span><select class="conversation-picker" aria-label="对应会话"></select><button class="pi-btn" data-all hidden>全部分支</button><button class="pi-btn" data-open>在 Lancer 中打开</button><button class="pi-x" data-close aria-label="收起">−</button></header><div class="run-progress"><span class="progress-label" role="status"></span><progress aria-label="任务完成进度" max="1" value="0"></progress></div><div class="pi-panes"></div></section>`;
const orb = root.querySelector<HTMLElement>(".pi-orb")!;
const panel = root.querySelector<HTMLElement>(".pi-panel")!;
const panes = root.querySelector<HTMLElement>(".pi-panes")!;
const labels: Record<Status, string> = {
  running: "运行中",
  queued: "排队中",
  waiting: "等待你",
  done: "完成",
  failed: "失败",
  idle: "空闲",
};
let lanes: Lane[] = [];
let selected = "";
let rootKey = "";
let lastMainRoot = "";
let solo: string | null = null;
const laneKey = (lane: { workspaceId: string; sessionId: string }) =>
  `${lane.workspaceId}:${lane.sessionId}`;
const paneCache = new Map<
  string,
  {
    pane: HTMLElement;
    log: HTMLTextAreaElement;
    title: HTMLElement;
    meta: HTMLElement;
    follow: HTMLButtonElement;
  }
>();
let expanded = false;
let unseen = 0;
let renderedRunning = -1;
const previous = new Map<string, Status>();
function render() {
  const scoped = lanes.filter((lane) => laneKey(lane.root) === rootKey);
  const running = scoped.filter((lane) => lane.status === "running").length;
  const done = scoped.filter((lane) => lane.status === "done" && !lane.stopped).length;
  const waiting = scoped.filter((lane) => lane.status === "waiting").length;
  const failed = scoped.filter((lane) => lane.status === "failed" && !lane.stopped).length;
  root.querySelector(".n")!.textContent = String(running);
  orb.classList.toggle("running", running > 0);
  root.querySelector<HTMLElement>(".wait")!.hidden = !waiting;
  root.querySelector<HTMLElement>(".fail")!.classList.toggle("active", failed > 0);
  const badge = root.querySelector<HTMLElement>(".bdg")!;
  badge.textContent = unseen ? `✓${unseen}` : "";
  badge.classList.toggle("on", unseen > 0);
  orb.classList.toggle("glow", unseen > 0);
  if (renderedRunning !== running) {
    renderedRunning = running;
    root.querySelector(".arcs")!.innerHTML = Array.from(
      { length: running },
      (_, i) =>
        `<circle cx="24" cy="24" r="21" fill="none" stroke="#0a0a0a" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="${(132 / running) * 0.62} 132" stroke-dashoffset="${(-i * 132) / running}"/>`,
    ).join("");
  }
  // Keep the status orb live, but do not update or measure an invisible CLI panel.
  // Incoming lane snapshots remain current and are rendered once on expansion.
  if (!expanded) return;
  root.querySelector(".sum .st")!.classList.toggle("running", running > 0);
  root.querySelector(".summary")!.textContent =
    `${running} 条线运行中 · ${done} 完成${waiting ? ` · ${waiting} 等待你` : ""}${failed ? ` · ${failed} 失败` : ""}`;
  const children = scoped.filter((lane) => laneKey(lane) !== rootKey);
  const tasks = children.length ? children : scoped.filter((lane) => lane.status !== "idle");
  const completed = tasks.filter((lane) => lane.status === "done" && !lane.stopped).length;
  const progress = root.querySelector<HTMLProgressElement>("progress")!;
  progress.max = Math.max(1, tasks.length);
  progress.value = completed;
  root.querySelector(".progress-label")!.textContent = tasks.length
    ? `${children.length ? "分支" : "任务"}完成 ${completed} / ${tasks.length}`
    : "尚未开始任务";
  const picker = root.querySelector<HTMLSelectElement>(".conversation-picker")!;
  const roots = lanes.filter((lane) => laneKey(lane) === laneKey(lane.root));
  const options = roots.map((lane) => [laneKey(lane), lane.title]);
  if (picker.dataset.options !== JSON.stringify(options)) {
    picker.replaceChildren(
      ...options.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value!;
        option.textContent = label!;
        return option;
      }),
    );
    picker.dataset.options = JSON.stringify(options);
  }
  picker.value = rootKey;
  const visible = lanes.filter(
    (lane) => laneKey(lane.root) === rootKey && (!solo || laneKey(lane) === solo),
  );
  panes.classList.toggle("solo", Boolean(solo));
  root.querySelector<HTMLButtonElement>("[data-all]")!.hidden = !solo;
  for (const [key, entry] of paneCache)
    if (!visible.some((lane) => laneKey(lane) === key)) entry.pane.remove();
  for (const lane of visible) {
    const key = laneKey(lane);
    let entry = paneCache.get(key);
    if (!entry) {
      const pane = document.createElement("section");
      pane.className = "pane";
      pane.dataset.session = key;
      const header = document.createElement("div");
      header.className = "ph";
      const title = document.createElement("button");
      title.className = "t";
      title.title = "展开此执行流";
      title.addEventListener("click", () => {
        selected = key;
        solo = key;
        render();
      });
      const meta = document.createElement("div");
      meta.className = "m";
      const log = document.createElement("textarea");
      log.className = "log";
      log.readOnly = true;
      log.spellcheck = false;
      log.setAttribute("aria-label", "实时 CLI 输出");
      const footer = document.createElement("div");
      footer.className = "pane-actions";
      const copy = document.createElement("button");
      copy.textContent = "复制";
      copy.addEventListener("click", () => {
        void navigator.clipboard.writeText(log.value).then(
          () => {
            copy.textContent = "已复制";
          },
          () => {
            copy.textContent = "复制失败";
          },
        );
      });
      const follow = document.createElement("button");
      follow.textContent = "跟随最新";
      follow.hidden = true;
      follow.addEventListener("click", () => {
        log.scrollTop = log.scrollHeight;
        follow.hidden = true;
      });
      log.addEventListener("scroll", () => {
        follow.hidden = log.scrollHeight - log.clientHeight - log.scrollTop < 20;
      });
      const expand = document.createElement("button");
      expand.textContent = "展开代码";
      expand.addEventListener("click", () => {
        selected = key;
        solo = key;
        render();
      });
      const wrap = document.createElement("button");
      wrap.textContent = "自动换行";
      wrap.setAttribute("aria-pressed", "true");
      log.classList.add("wrap");
      wrap.addEventListener("click", () => {
        const enabled = log.classList.toggle("wrap");
        wrap.setAttribute("aria-pressed", String(enabled));
      });
      footer.append(expand, wrap, copy, follow);
      header.append(title, meta);
      pane.append(header, log, footer);
      entry = { pane, log, title, meta, follow };
      paneCache.set(key, entry);
    }
    if (entry.pane.parentElement !== panes) panes.append(entry.pane);
    entry.pane.classList.toggle("sel", key === selected);
    entry.pane.dataset.status = lane.stopped ? "stopped" : lane.status;
    entry.log.placeholder = lane.status === "running" ? "正在等待 CLI 输出…" : "暂无 CLI 输出";
    entry.title.textContent = `${key === rootKey ? "主会话" : "分支"} · ${lane.title}`;
    entry.meta.textContent = `${lane.stopped ? "已停止" : labels[lane.status]} · ${lane.model}`;
    if (entry.log.value !== lane.output) {
      const atBottom = entry.log.scrollHeight - entry.log.clientHeight - entry.log.scrollTop < 20;
      const top = entry.log.scrollTop,
        start = entry.log.selectionStart,
        end = entry.log.selectionEnd;
      entry.log.value = lane.output;
      entry.log.setSelectionRange(start, end);
      entry.log.scrollTop = atBottom ? entry.log.scrollHeight : top;
      entry.follow.hidden = atBottom;
    }
  }
  let empty = panes.querySelector<HTMLElement>(".empty");
  if (!visible.length && !empty) {
    empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "选择一个会话，查看它的实时执行流";
    panes.append(empty);
  } else if (visible.length) empty?.remove();
}
function setExpanded(value: boolean) {
  expanded = value;
  panel.classList.toggle("closed", !value);
  orb.classList.toggle("hidden", value);
  if (value) {
    unseen = 0;
    window.piOrb.expand();
  } else window.piOrb.collapse();
  render();
}
let clickTimer: number | undefined;
orb.addEventListener("click", () => {
  if (clickTimer !== undefined) return;
  clickTimer = window.setTimeout(() => {
    clickTimer = undefined;
    setExpanded(true);
  }, 250);
});
orb.addEventListener("dblclick", () => {
  window.clearTimeout(clickTimer);
  clickTimer = undefined;
  const lane =
    lanes.find((lane) => laneKey(lane) === selected) ??
    lanes.find((lane) => laneKey(lane) === rootKey);
  if (lane) window.piOrb.open(lane.workspaceId, lane.sessionId);
});
root.querySelector("[data-close]")!.addEventListener("click", () => setExpanded(false));
root.querySelector("[data-open]")!.addEventListener("click", () => {
  const lane =
    lanes.find((lane) => laneKey(lane) === selected) ??
    lanes.find((lane) => laneKey(lane) === rootKey);
  if (lane) {
    setExpanded(false);
    window.piOrb.open(lane.workspaceId, lane.sessionId);
  }
});
window.piOrb.onLanes((next) => {
  for (const lane of next) {
    const key = `${lane.workspaceId}:${lane.sessionId}`;
    if (!expanded && previous.has(key) && previous.get(key) !== "done" && lane.status === "done")
      unseen++;
    previous.set(key, lane.status);
  }
  lanes = next;
  const main = lanes.find((lane) => lane.selected);
  if (main && laneKey(main.root) !== lastMainRoot) {
    lastMainRoot = laneKey(main.root);
    rootKey = lastMainRoot;
    selected = laneKey(main);
    solo = null;
  }
  if (!rootKey && lanes[0]) rootKey = laneKey(lanes[0].root);
  render();
});
render();

root.querySelector<HTMLSelectElement>(".conversation-picker")!.addEventListener("change", (e) => {
  rootKey = (e.target as HTMLSelectElement).value;
  selected = rootKey;
  solo = null;
  render();
});
root.querySelector("[data-all]")!.addEventListener("click", () => {
  solo = null;
  render();
});
orb.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    setExpanded(true);
  }
});
