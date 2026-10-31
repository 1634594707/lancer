import { expect, test } from "@playwright/test";
import {
  nativeReplyRecords,
  replyLead,
} from "../../src/features/conversation/doubao-app/doubao-message-presentation";

test("native narration keeps its ordered captions, failures and original result", () => {
  const text = [
    "开始制作成片。先分析轨迹，再合成。",
    "查看指定动画文件",
    "文件已找到。",
    "排查脚本读取问题",
    "解析失败，尚未生成成片。",
    "交付指定视频相关文件",
    "成片已完成并交付。",
    "文件：成片.mp4，具体参数请核对。",
  ].join("\n");
  expect(nativeReplyRecords(text)).toEqual({
    introduction: "开始制作成片。先分析轨迹，再合成。",
    records: [
      { title: "查看指定动画文件", text: "文件已找到。" },
      { title: "排查脚本读取问题", text: "解析失败，尚未生成成片。" },
      { title: "交付指定视频相关文件", text: "" },
    ],
    result: "成片已完成并交付。\n文件：成片.mp4，具体参数请核对。",
  });
});

test("unfinished replies have no inferred delivery, duration or success", () => {
  const projection = nativeReplyRecords(
    "先检查文件。\n查看动画文件\n未找到。\n排查路径错误\n等待用户提供目录。",
  );
  expect(projection?.result).toBe("");
  expect(projection?.records.at(-1)?.text).toBe("等待用户提供目录。");
  for (const text of [
    "请依次查看文件、分析视频、保存结果。",
    "操作建议：\n1. 查看文件\n2. 分析视频",
    "代码示例：\n```text\n查看动画文件\n排查路径错误\n```",
    "代码示例：\n~~~text\n查看动画文件\n排查路径错误\n~~~",
  ])
    expect(nativeReplyRecords(text)).toBeNull();
});

test("brief leads use whole source sentences and do not cut Markdown or links", () => {
  const sentence = "参考视频和素材已整理好，请核对蒙版轨迹。";
  expect(replyLead(sentence.repeat(12))).toBe(sentence);
  expect(replyLead(`已完成。${"详细说明".repeat(50)}[文件](https://example.com)`)).toBe("已完成。");
  const link = `[查看笔记](https://example.com/${"long-path-".repeat(24)})`;
  expect(replyLead(link)).toBeNull();
  expect(replyLead("**请核对** [笔记](https://example.com)")).toBe(
    "**请核对** [笔记](https://example.com)",
  );
  expect(replyLead("```ts\nconst file = 'result.mp4';\n```")).toBeNull();
});
