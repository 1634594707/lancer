import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { makeGitWorkspace, seedProcessTimelineDemoFixture } from "./electron-app";

/** Every sidebar branch is a real checkout in the isolated fixture repository. */
export async function makeLancerScreenshotFixture(agentDir: string, userDataDir: string) {
  const repositoryPath = await makeGitWorkspace("Lancer");
  const branches = [
    "lancer-ui",
    "douyin-watch",
    "web-digest",
    "xhs-notes",
    "douyin-dl",
    "douyin-learn",
    "douyin-render",
    "web-collect",
    "motion-demo",
    "review",
    "xhs-cover",
  ];
  const paths: string[] = [];
  for (const branch of branches) {
    const path = join(userDataDir, "worktrees", "Lancer", branch);
    await mkdir(dirname(path), { recursive: true });
    await promisify(execFile)("git", [
      "-C",
      repositoryPath,
      "worktree",
      "add",
      "-b",
      `wt/${branch}`,
      path,
    ]);
    paths.push(await realpath(path));
  }
  const fixture = await seedProcessTimelineDemoFixture(agentDir, paths[0]!, {
    laneWorkspaces: { video: paths[1]!, research: paths[2]!, xhs: paths[3]! },
    extraSessions: [
      { zone: "video", title: "豆包 · 下载抖音视频", provider: "volcengine", model: "doubao" },
      {
        zone: "video",
        title: "Grok+Opus · 讨论沉淀学习",
        provider: "anthropic",
        model: "claude-opus-4-5",
      },
      { zone: "video", title: "Codex · 生成示范视频", provider: "openai", model: "gpt-5" },
      { zone: "research", title: "X · 搜集动画方向优质帖", provider: "xai", model: "grok-3-mini" },
      { zone: "research", title: "Codex · 实现动效 demo", provider: "openai", model: "gpt-5" },
      {
        zone: "lancer",
        title: "Opus · 审查：并发写入竞争",
        provider: "anthropic",
        model: "claude-opus-4-5",
      },
      { zone: "xhs", title: "Astra · 封面文案 A/B", provider: "openai", model: "gpt-4o" },
    ].map((spec, index) => ({ ...spec, workspacePath: paths[index + 4]! })),
  });
  return {
    fixture,
    repositoryPath,
    workspacePath: paths[0]!,
    initialWorkspaces: [repositoryPath, ...paths],
  };
}
