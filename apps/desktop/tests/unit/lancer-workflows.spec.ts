import { expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LancerAssistantStore } from "../../electron/application/lancer-assistant-store";
import { decodeLancerWorkflow, workflowTaskPrompt } from "../../contracts/lancer-workflows";
import type { RuntimeSnapshot } from "@lancer/session-driver/runtime-types";
import { conversationZoneId } from "../../contracts/lancer-zones";

test("explicit module membership does not infer modes from an ordinary conversation topic", () => {
  expect(conversationZoneId("视频和 GitHub 论文查询")).toBe("chat");
  expect(conversationZoneId("lancer-zone:video|自由命名")).toBe("video");
  expect(conversationZoneId("lancer-zone:chat|视频问题")).toBe("chat");
  expect(conversationZoneId("lancer-zone:missing|兼容旧数据")).toBe("chat");
});

test("workflow configuration and selected stage survive assistant edits and restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lancer-workflows-"));
  const store = new LancerAssistantStore(dir);
  await store.load();
  const target = { workspaceId: "w", sessionId: "s" };
  const workflow = {
    steps: [
      {
        title: "理解",
        model: { provider: "a", modelId: "one" },
        skills: ["research"],
        goal: "查明来源",
        deliverables: "有出处的对照表",
      },
      { title: "制作", model: { provider: "b", modelId: "two" } },
    ],
    activeStep: 1,
  };
  await store.change({ kind: "save-workflow", target, workflow });
  await store.change({ kind: "save-assistant", id: "lancer", name: "Lancer 改名", avatar: "a1" });
  expect((await new LancerAssistantStore(dir).load()).workflows?.["w:s"]).toEqual(workflow);
  for (const invalid of [
    null,
    { steps: [] },
    { steps: [{ title: " " }] },
    { ...workflow, activeStep: 2 },
    { steps: [{ title: "阶段", model: { provider: "" } }] },
    { steps: [{ title: "阶段", skills: [null] }] },
    { steps: [{ title: "阶段", goal: 123 }] },
    { steps: [{ title: "阶段", deliverables: "a".repeat(4001) }] },
  ]) {
    expect(() => decodeLancerWorkflow(invalid)).toThrow();
  }
  await expect(
    store.change({ kind: "save-workflow", target, workflow: { steps: [] } }),
  ).rejects.toThrow();
  expect((await new LancerAssistantStore(dir).load()).workflows?.["w:s"]).toEqual(workflow);
});

test("stage tasks carry actual skill commands and requirements, rejecting unavailable skills", () => {
  const runtime: RuntimeSnapshot = {
    workspace: { workspaceId: "w", path: "/tmp/workflow" },
    providers: [],
    models: [],
    extensions: [],
    settings: { enableSkillCommands: true, enabledModelPatterns: [] },
    skills: [
      {
        name: "research",
        description: "Research",
        filePath: "/tmp/research/SKILL.md",
        baseDir: "/tmp/research",
        source: "project",
        scope: "project",
        enabled: true,
        disableModelInvocation: false,
        slashCommand: "/skill:research",
      },
    ],
  };
  const step = { title: "核验", goal: "核对出处", deliverables: "对照表", skills: ["research"] };
  const prompt = workflowTaskPrompt(step, runtime);
  expect(prompt).toMatch(/^\/skill:research 执行阶段/);
  expect(prompt).toContain("核对出处");
  expect(prompt).toContain("对照表");
  expect(prompt).toContain("/tmp/research/SKILL.md");
  expect(() => workflowTaskPrompt({ ...step, skills: ["missing"] }, runtime)).toThrow(/不可用/);
  expect(() => workflowTaskPrompt({ ...step, goal: "" }, runtime)).toThrow(/问题/);
  expect(
    workflowTaskPrompt(step, {
      ...runtime,
      settings: { ...runtime.settings, enableSkillCommands: false },
    }),
  ).not.toMatch(/^\//);
  expect(decodeLancerWorkflow({ steps: [{ title: "旧配置" }] })).toEqual({
    steps: [{ title: "旧配置" }],
  });
});
