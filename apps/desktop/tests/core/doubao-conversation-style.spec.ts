import { expect, test } from "@playwright/test";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
  seedAgentDir,
} from "../helpers/electron-app";

test("Doubao keeps user requests in the shared conversation layout and preserves sending", async () => {
  const userData = await makeUserDataDir();
  const workspace = await makeWorkspace("doubao-style");
  const agentDir = join(userData, "agent");
  await seedAgentDir(agentDir, { withOpenAiAuth: false, withDefaultModel: false });
  const helper = join(userData, "doubao-style.mjs");
  const state = join(userData, "native-state.json");
  await writeFile(
    state,
    JSON.stringify({
      conversationId: "56789",
      transcriptVersion: 2,
      messages: [
        { role: "user", text: "保存到 /Users/test/downloads/，并核验 SHA256" },
        { role: "assistant", text: "已收到。\n\n**核验步骤**：先下载，再检查。" },
      ],
    }),
  );
  await writeFile(
    helper,
    `#!${process.execPath}
import fs from 'node:fs';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const path=${JSON.stringify(state)};
const data=JSON.parse(fs.readFileSync(path,'utf8'));
if(input.action==='send') data.messages.push({role:'user',text:input.text},{role:'assistant',text:'新的回复已返回'});
fs.writeFileSync(path,JSON.stringify(data));
console.log(JSON.stringify({ok:true,permission:true,title:'排版验收会话',busy:false,...data,sent:input.action==='send'}));
`,
  );
  await chmod(helper, 0o755);
  const app = await launchDesktop(userData, {
    agentDir,
    initialWorkspaces: [workspace],
    testMode: "background",
    scrubProviderEnv: true,
    envOverrides: { PI_APP_DOUBAO_HELPER_PATH: helper },
  });
  try {
    const page = await app.firstWindow();
    await openNewThread(page);
    await page.locator(".new-thread__hint .model-selector__badge").first().click();
    await page.getByTestId("choose-doubao-app").click();
    const transcript = page.getByTestId("doubao-app-transcript");
    await expect(transcript.locator(".process-user")).toContainText("核验 SHA256");
    await expect(transcript.locator(".process-assistant .who img")).toBeVisible();
    await expect(transcript.locator(".process-assistant .tx strong")).toHaveText("核验步骤");
    await expect(transcript.getByText("排版验收会话", { exact: true })).toBeHidden();
    // A native parser upgrade must not leave duplicate old records in the active
    // conversation or discard them. The original mirror remains inspectable.
    const upgraded = JSON.parse(await readFile(state, "utf8")) as Record<string, unknown>;
    upgraded.transcriptVersion = 3;
    await writeFile(state, JSON.stringify(upgraded));
    await page.getByTestId("doubao-app-composer").fill("继续检查");
    await page.getByTestId("doubao-app-send").click();
    await expect(transcript.locator(".doubao-app-message--assistant").last()).toContainText(
      "新的回复已返回",
    );
    const archive = transcript.locator(".doubao-app-archive");
    await expect(archive.locator("summary")).toBeHidden();
    await transcript.getByText("会话连接", { exact: true }).click();
    await expect(archive.locator("summary")).toContainText("2 条");
    await expect(archive.locator("article").first()).toBeHidden();
    await archive.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(archive.locator("article").first()).toBeVisible();
    await expect(archive.locator("article")).toHaveCount(2);
    await page.keyboard.press("Enter");
    await transcript.getByText("会话连接", { exact: true }).click();
    const sourceUrl = `https://example.com/video/${"reference-".repeat(18)}notes`;
    const longReply =
      "参考视频和素材已经整理好，下一步核对蒙版轨迹和音乐卡点。".repeat(8) +
      `[查看分析笔记](${sourceUrl})\n\n` +
      Array.from(
        { length: 14 },
        (_, i) => `${i + 1}. 已记录这一段的画面和时间点，具体参数保留在分析笔记中。`,
      ).join("\n") +
      "\n\n结尾核对凭据：保留完整内容。";
    const busyState = JSON.parse(await readFile(state, "utf8")) as {
      messages: { role: string; text: string }[];
      busy?: boolean;
    };
    busyState.messages.push(
      { role: "user", text: "请把参考视频和素材整理好，回复简短一些，具体参数放在文件中。" },
      { role: "assistant", text: longReply },
    );
    busyState.busy = true;
    await writeFile(state, JSON.stringify(busyState));
    await transcript.getByText("会话连接", { exact: true }).click();
    await transcript.getByRole("button", { name: "刷新回复" }).click();
    await transcript.getByText("会话连接", { exact: true }).click();
    const response = transcript.locator(".doubao-app-message--assistant").last();
    await expect(response.locator(".doubao-message-lead")).toHaveText(
      "参考视频和素材已经整理好，下一步核对蒙版轨迹和音乐卡点。",
    );
    await expect(response.getByRole("link", { name: "查看分析笔记" })).toBeHidden();
    await expect(response.getByText("结尾核对凭据：保留完整内容。")).toBeHidden();
    expect((await response.boundingBox())!.height).toBeLessThan(180);
    const running = transcript.locator(".doubao-app-pending");
    await expect(running).toBeVisible();
    const border = running.locator(".process-running-border rect");
    const offset = await border.evaluate((el) => getComputedStyle(el).strokeDashoffset);
    await expect
      .poll(() => border.evaluate((el) => getComputedStyle(el).strokeDashoffset))
      .not.toBe(offset);
    await response.locator(".doubao-message-full > summary").focus();
    await page.keyboard.press("Enter");
    await expect(response.getByText("结尾核对凭据：保留完整内容。")).toBeVisible();
    await expect(response.getByRole("link", { name: "查看分析笔记" })).toHaveAttribute(
      "href",
      sourceUrl,
    );
    await response.locator(".doubao-message-full > summary").click();
    await expect(response.getByText("结尾核对凭据：保留完整内容。")).toBeHidden();
    // Real native replies interleave action captions and speech. The renderer
    // must preserve that order without inventing tool success or flattening it.
    const nativeReply = [
      "开始制作成片。我会先核对蒙版轨迹，再制作视频。",
      "查看指定动画文件",
      "文件已找到，现在检查素材。",
      "确定导出执行方案",
      "统一使用 1920×1080、30fps。",
      "排查脚本读取问题",
      "偶数行解析失败。需要检查配置后再继续。",
      "编写合成脚本",
      "逐帧合成，并保留参考音乐。",
      "交付指定视频相关文件",
      "成片已完成并交付。",
      "成片：1920×1080 / 30fps / 10.75s。",
      "请逐帧核对蒙版轨迹，不能仅凭文字判断复刻质量。",
    ].join("\n");
    busyState.messages.push(
      {
        role: "user",
        text: `继续制作 Fate 蒙版卡点成片，优先 Saber。${"请保留轨迹、转场和音乐节奏。".repeat(22)}`,
      },
      { role: "assistant", text: nativeReply },
    );
    busyState.busy = false;
    await writeFile(state, JSON.stringify(busyState));
    await transcript.getByText("会话连接", { exact: true }).click();
    await transcript.getByRole("button", { name: "刷新回复" }).click();
    await transcript.getByText("会话连接", { exact: true }).click();
    const process = response.locator(".doubao-message-process");
    await expect(process.locator(":scope > summary")).toContainText("5 条记录");
    await expect(process.locator(".doubao-message-record > summary")).toHaveText([
      "查看指定动画文件",
      "确定导出执行方案",
      "排查脚本读取问题",
      "编写合成脚本",
    ]);
    await expect(response.locator(".doubao-message-result")).toHaveText("成片已完成并交付。");
    const failedRecord = process
      .locator(".doubao-message-record")
      .filter({ hasText: "排查脚本读取问题" });
    await expect(failedRecord.locator(".message__content")).toBeHidden();
    await failedRecord.locator("summary").click();
    await expect(failedRecord.locator(".message__content")).toHaveText(
      "偶数行解析失败。需要检查配置后再继续。",
    );
    await failedRecord.locator("summary").click();
    await expect(process).not.toContainText("步 ·");
    const original = process.locator(".doubao-message-full");
    await original.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(
      original.getByText("请逐帧核对蒙版轨迹，不能仅凭文字判断复刻质量。", { exact: false }),
    ).toBeVisible();
    await original.locator("summary").click();
    await process.locator(":scope > summary").click();
    await expect(process.getByText("豆包回复记录", { exact: true })).toBeHidden();
    await process.locator(":scope > summary").click();
    await expect(process.getByText("豆包回复记录", { exact: true })).toBeVisible();
    await expect(
      transcript.locator(".doubao-app-message--user").last().locator(".doubao-message-lead"),
    ).toHaveText("继续制作 Fate 蒙版卡点成片，优先 Saber。");
    await expect(running).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("doubao-unified-wide.png") });
    await page.setViewportSize({ width: 1000, height: 760 });
    await expect(page.getByTestId("doubao-app-send")).toBeVisible();
    await process.locator(":scope > summary").scrollIntoViewIfNeeded();
    await expect(process.locator(":scope > summary")).toBeInViewport();
    expect(await transcript.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("doubao-unified-narrow.png") });
    await page.reload();
    await transcript.getByText("会话连接", { exact: true }).click();
    await expect(archive.locator("summary")).toContainText("2 条");
    await expect(archive.locator("article").first()).toBeHidden();
    await transcript.getByText("会话连接", { exact: true }).click();
    await expect(process.locator(":scope > summary")).toContainText("5 条记录");
    await expect(response.locator(".doubao-message-result")).toHaveText("成片已完成并交付。");
    await expect(original.locator(".doubao-message-original")).toBeHidden();
    const persisted = JSON.parse(await readFile(state, "utf8")) as typeof busyState;
    expect(persisted.messages.at(-1)?.text).toBe(nativeReply);
  } finally {
    await app.close();
  }
});
