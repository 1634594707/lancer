import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const ocr = JSON.parse(await readFile(resolve(root, ".lancer-task/out/ref-ocr.json"), "utf8"));
const data = JSON.parse(
  await readFile(resolve(root, ".lancer-task/out/reference-data.json"), "utf8"),
);
const fixes = { 7: "20:10:30", 24: "20:11:07", 39: "20:11:30", 59: "20:12:01" };
const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
const frames = ocr.map((frame) => {
  const seconds = frame.seconds;
  let text =
    fixes[frame.index] ??
    frame.text.find((entry) => entry.x > 1360 && entry.y > 160 && entry.y < 195)?.text;
  if (text)
    text = text
      .replace(/^28:/, "20:")
      .replace(":18:", ":10:")
      .replace(/:8([0-9])$/, ":0$1");
  const parts = text?.split(":").map(Number);
  const time = parts?.length === 3 ? ((parts[1] - 10) * 60 + parts[2]) / 7 : 2;
  const open = [];
  if (seconds >= 13.8) open.push("ev22");
  if (seconds >= 15.8) open.push("gev22");
  if (seconds >= 17.8) open.push("sev22_2");
  if (seconds >= 22.2) open.push("ev12");
  if (seconds >= 28.8) open.push("ev37");
  if (seconds >= 31.35) open.push("gev37");
  if (seconds >= 33.2) open.push("sev37_2");
  if (seconds >= 44.8) open.push("ev27");
  const lane = seconds < 28.8 ? "v" : seconds < 40.8 ? "r" : "all";
  const highlighted =
    seconds >= 44.8
      ? "ev27"
      : seconds >= 28.8
        ? "ev37"
        : seconds >= 22.2
          ? "ev12"
          : seconds >= 13.8
            ? "ev22"
            : null;
  let selector, anchor;
  const textEntries = frame.text.filter(
    (entry) => entry.x > 260 && entry.x < 950 && entry.y >= 224 && entry.y < 765,
  );
  if (lane === "v") {
    if (seconds >= 15.8 && seconds < 20.6) {
      anchor = textEntries.find(
        (entry) => /keyframes/i.test(entry.text) && entry.x < 330 && !entry.text.includes("%"),
      );
      selector = '[data-ev="ev22"] .ti';
    } else {
      anchor = textEntries.find((entry) =>
        normalize(entry.text).includes("收到我先把视频下载到工作区"),
      );
      selector = '[data-process-id="v-message-0"] .tx';
    }
  } else if (lane === "r") {
    if (seconds < 33.2) {
      anchor = textEntries.find((entry) => normalize(entry.text).includes("收到我先把弹"));
      selector = '[data-process-id="r-message-7"] .tx';
    } else {
      anchor = textEntries.find((entry) => normalize(entry.text).includes("测试2失败"));
      selector = '[data-ev="ev37"] .ti';
    }
  } else {
    const choices =
      seconds < 43.3
        ? [["测试2失败", "ev37"]]
        : seconds < 49.3
          ? [
              ["文案v1", "ev23"],
              ["等待你确认文案", "ev27"],
            ]
          : [["审查通过", "ev40"]];
    for (const [text, id] of choices) {
      anchor = textEntries.find((entry) => normalize(entry.text).includes(text));
      if (anchor) {
        selector = `[data-ev="${id}"] .ti`;
        break;
      }
    }
  }
  return {
    seconds,
    // Visible first tool, retry and final scheduling row disambiguate the rounded clock.
    time:
      frame.index === 0
        ? 1.999
        : frame.index === 61
          ? 17.6
          : frame.index === 102
            ? 25.6
            : Math.min(26.5, Math.max(2, time)),
    lane,
    focus: lane === "r" ? "r" : "",
    highlighted,
    open,
    ...(anchor && selector
      ? {
          anchor: {
            selector,
            // Research prose uses a measured ink-to-DOM offset. The multiline
            // +5px heuristic shifted these single lines 8px below the source.
            y: anchor.y + (lane === "r" && seconds < 33.2 ? -3 : anchor.height > 20 ? 5 : -2),
          },
        }
      : {}),
  };
});
await writeFile(
  resolve(root, "apps/desktop/src/features/conversation/lancer-process/replay-timing.ts"),
  `// Half-second annotations measured from the supplied 56-second recording.\nexport interface ReplayKeyframe { readonly seconds: number; readonly time: number; readonly lane: string; readonly focus: string; readonly highlighted: string | null; readonly open: readonly string[]; readonly anchor?: { readonly selector: string; readonly y: number }; }\nexport const REPLAY_TIMING: readonly ReplayKeyframe[] = ${JSON.stringify(frames, null, 2)};\n`,
);
const describe = (frame) => {
  if (!frame.seconds) return "第 0 秒已显示完整会话界面；不显示白场或灰幕。";
  const notes =
    frame.lane === "all"
      ? ["全局流转：四条任务线按时间交错，紧凑事件行，共用工作树锚点。"]
      : frame.lane === "r"
        ? ["聚焦外网调研，其他泳道淡出；Codex 的 spring.ts / path-morph.ts 测试链。"]
        : ["视频学习：豆包下载 → Grok 抽帧，其他泳道同步推进。"];
  if (frame.open.includes("ev22"))
    notes.push(
      frame.open.includes("sev22_2")
        ? "关键帧阶段展开，ffmpeg 抽帧代码和六张条纹缩略图可见/随滚动移出。"
        : frame.open.includes("gev22")
          ? "关键帧五个子步骤列表展开。"
          : "关键帧阶段展开为步骤摘要与缩略图。",
    );
  if (frame.open.includes("ev12"))
    notes.push("豆包 → Grok 交接卡展开（文件、摘要、决策、8.8k 校验）。");
  if (frame.open.includes("ev37"))
    notes.push(
      frame.open.includes("sev37_2")
        ? "测试失败的 npm test 输出展开，红/绿结果行。"
        : "树节点定位到测试 2 失败，阶段高亮。",
    );
  if (frame.open.includes("ev27"))
    notes.push(
      frame.time >= 23.9
        ? "标题 B 已确认，等待节点变为确认态。"
        : "等待你确认文案：A/B 选项展开，泳道暂停。",
    );
  notes.push(
    frame.anchor
      ? `聊天随镜头滚动，对齐 ${frame.anchor.selector}，参考文字顶边约 ${frame.anchor.y.toFixed(1)}px。`
      : "聊天保持当前阅读位置。",
  );
  const upcoming = data.events.filter(
    (event) =>
      event.time > frame.time &&
      event.time <= frame.time + 0.7 &&
      event.kind !== "tool" &&
      event.kind !== "start",
  );
  if (upcoming.length)
    notes.push(
      `充能/大弧线发射：${upcoming.map((event) => event.label).join("、")}；端点随源行/接力 chip 和树节点移动。`,
    );
  return notes.join(" ");
};
const lines = [
  "# 第 8 轮参考镜头表",
  "",
  "唯一参考：`refs/demo-light.mp4`，1440×900 / 60fps / 56.000s，MD5 `bb91b70563ac537b8148655d20a184f9`。每 0.5 秒抽帧一次，0.0–55.5s 共 112 张。",
  "",
  "录屏中的逻辑时钟不是匀速墙钟：开始约 T=2，末尾冻结在 T=26.5；下表 T 从右侧时钟 OCR 结合相邻帧纠错得到，精度受时钟 1/7 秒量化限制。回放脚本另记录展开/点击/滚动关键点，不把 23 秒 HD 片段当标准。",
  "",
  "| 帧 | 录像时段 | 逻辑 T | 画面、交互及动画 |",
  "| --- | --- | --- | --- |",
  ...frames.map(
    (frame, i) =>
      `| [${String(i).padStart(3, "0")}](ref-frames/${String(i).padStart(3, "0")}.png) | ${frame.seconds.toFixed(1)}–${(frame.seconds + 0.5).toFixed(1)}s | ${frame.time.toFixed(3)} | ${describe(frame)} |`,
  ),
  "",
  "## 交互分镜索引",
  "",
  "- 0–11.5s：下载/交接到 Grok，四路事件与长弧线依次发生。",
  "- 13.8s：展开 keyframes；15.8s：展开五步列表；17.8s：展开 ffmpeg 输出。",
  "- 20.3–21.0s：向上滚动，源行和曲线锚点同步移动。",
  "- 22.2s：展开豆包→Grok 交接包；27s 左右树节点 hover/click 对照。",
  "- 28.8s：点击研究线失败节点，切会话并定位。",
  "- 31.35s：原视频首次显示 spring.ts / path-morph.ts / npm test 三个步骤。",
  "- 33.2s：展开 npm test 的失败输出。",
  "- 40.8s：全部车道（全局流转）切换，事件重排为紧凑时间行。",
  "- 43–44s：全局视图上滚到关键帧 / 中段事件。",
  "- 44.8s：展开等待你确认标题；约 46.5s 标题 B 确认。",
  "- 49–51s：全局视图向下滚动，多条关系线一起滑动；53–56s 末尾定格。",
  "",
];
await writeFile(resolve(root, ".lancer-task/out/shotlist.md"), lines.join("\n"));
console.log(
  `Wrote ${frames.length} shot annotations; ${frames.filter((frame) => frame.anchor).length} measured reading anchors`,
);
