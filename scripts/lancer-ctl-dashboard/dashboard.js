/* Read-only DOM UI. Session content is always text, never HTML. */
const $ = (id) => document.getElementById(id);
const key = (session) => `${session.workspaceId}:${session.sessionId || session.id}`;
const status = (session) => session.status || "idle";
const active = (session) => status(session) === "running" || session.pending > 0;
const time = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};
let sessions = [];
let selected = null;
let generation = 0;
let tailTimer;
let fingerprint = "";
const rows = new Map();

function node(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}
function error(id, message) {
  $(id).textContent = message || "";
  $(id).hidden = !message;
}
async function get(route) {
  const response = await fetch(route, { signal: AbortSignal.timeout(38_000), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function renderList() {
  const query = $("search").value.trim().toLowerCase();
  const filter = $("filter").value;
  const counts = new Map();
  for (const session of sessions)
    counts.set(status(session), (counts.get(status(session)) || 0) + 1);
  $("counts").replaceChildren(
    node("span", "count", `${sessions.length} sessions`),
    ...["running", "idle", "waiting", "queued", "failed", "done"]
      .filter((state) => counts.has(state) || ["running", "idle", "failed"].includes(state))
      .map((state) => node("span", `count ${state}`, `${counts.get(state) || 0} ${state}`)),
  );
  const sorted = [...sessions].sort(
    (a, b) =>
      Number(active(b)) - Number(active(a)) ||
      String(b.updatedAt).localeCompare(String(a.updatedAt)),
  );
  let visible = 0;
  for (const [position, session] of sorted.entries()) {
    const id = key(session);
    let row = rows.get(id);
    if (!row) {
      row = node("button", "session", "");
      row.type = "button";
      row.dataset.session = id;
      row.addEventListener("click", () => select(id));
      rows.set(id, row);
    }
    const state = status(session);
    const text = [session.title, session.model, session.cwd, session.zone, session.workspace].join(
      " ",
    );
    row.hidden =
      !text.toLowerCase().includes(query) ||
      (filter !== "all" &&
        !(filter === "waiting" ? ["waiting", "queued"].includes(state) : state === filter));
    if (!row.hidden) visible++;
    row.className = `session ${active(session) ? "running" : state}${selected === id ? " selected" : ""}`;
    row.setAttribute("aria-pressed", String(selected === id));
    const signature = JSON.stringify(session);
    if (row.dataset.signature !== signature) {
      row.dataset.signature = signature;
      const heading = node("div", "row-heading", "");
      heading.append(
        node("strong", "", session.title || "Untitled"),
        node(
          "span",
          `badge ${state}`,
          `${state}${session.pending ? ` · pending ${session.pending}` : ""}`,
        ),
      );
      row.replaceChildren(
        heading,
        node("div", "model", session.model || "default / unknown model"),
        node("div", "path", `${session.zone || session.zoneId || "—"} · ${session.cwd || "—"}`),
        node("div", "last-line", session.lastLine || session.stage || "暂无活动摘要"),
        node(
          "div",
          "updated",
          `Updated ${time(session.updatedAt)}${session.archived ? " · archived" : ""}`,
        ),
      );
    }
    // Keep nodes/focus stable when order hasn't changed.
    const current = $("session-list").children[position];
    if (current !== row) $("session-list").insertBefore(row, current || null);
  }
  const ids = new Set(sessions.map(key));
  for (const [id, row] of rows) {
    if (!ids.has(id)) {
      row.remove();
      rows.delete(id);
    }
  }
  $("empty").hidden = visible > 0;
}
function select(id) {
  if (selected === id) return;
  selected = id;
  generation++;
  clearTimeout(tailTimer);
  fingerprint = "";
  error("tail-error", null);
  $("activity").replaceChildren(node("p", "", id ? "加载近期活动…" : "暂无会话"));
  $("assistant-section").hidden = true;
  $("tail-updated").textContent = id ? "连接中…" : "";
  renderHeading();
  renderList();
  if (id) loadTail(generation);
}
function renderHeading() {
  const session = sessions.find((item) => key(item) === selected);
  $("detail-title").textContent = session?.title || "选择一条车道";
  $("detail-meta").textContent = session
    ? `${session.status} · ${session.model || "default / unknown"}\n${session.zone || "—"} · ${session.cwd}\n${key(session)}`
    : "";
}
async function loadSessions() {
  try {
    const data = await get("api/sessions");
    sessions = data.sessions;
    error("list-error", null);
    document.body.classList.remove("stale");
    $("connection").textContent = `● Live · ${new Date().toLocaleTimeString()}`;
    if (!sessions.some((session) => key(session) === selected)) {
      select(keyOrNull(sessions.find(active) || sessions[0]));
    }
    renderList();
    renderHeading();
  } catch (cause) {
    document.body.classList.add("stale");
    $("connection").textContent = "● Disconnected · 正在重试";
    error("list-error", `会话列表已过期，保留最后快照。${cause.message}`);
  } finally {
    setTimeout(loadSessions, 1000);
  }
}
function keyOrNull(session) {
  return session ? key(session) : null;
}
async function loadTail(version) {
  if (!selected) return;
  try {
    const tail = await get(`api/tail?session=${encodeURIComponent(selected)}`);
    if (version !== generation) return;
    error("tail-error", tail.error);
    $("tail-updated").textContent = `Tail · ${new Date().toLocaleTimeString()}`;
    const next = JSON.stringify([tail.messages, tail.lastAssistant]);
    if (next !== fingerprint) {
      const activity = $("activity");
      const atBottom =
        !fingerprint || activity.scrollHeight - activity.scrollTop - activity.clientHeight < 60;
      fingerprint = next;
      $("assistant-section").hidden = !tail.lastAssistant;
      $("assistant").textContent = tail.lastAssistant || "";
      activity.replaceChildren(
        ...tail.messages.map((item) => {
          const entry = node("article", "event", "");
          entry.append(
            node(
              "div",
              "event-meta",
              `${item.toolName || item.role || item.kind} ${item.status || ""} · ${time(item.createdAt)}`,
            ),
            node("pre", "", item.text || "（无文本）"),
          );
          return entry;
        }),
      );
      if (!tail.messages.length) activity.append(node("p", "", "暂无活动"));
      if (atBottom) activity.scrollTop = activity.scrollHeight;
    }
  } catch (cause) {
    if (version !== generation) return;
    $("tail-updated").textContent = "Tail 已过期 · 正在重试";
    error("tail-error", `活动读取失败，保留最后快照。${cause.message}`);
  } finally {
    if (version === generation && selected) tailTimer = setTimeout(() => loadTail(version), 1000);
  }
}
$("search").addEventListener("input", renderList);
$("filter").addEventListener("change", renderList);
$("latest").addEventListener("click", () => {
  $("activity").scrollTop = $("activity").scrollHeight;
});
loadSessions();
