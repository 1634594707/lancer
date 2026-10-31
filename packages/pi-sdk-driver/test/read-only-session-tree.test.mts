import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { JsonCatalogStore } from "@lancer/catalogs/node";
import { SessionSupervisor } from "../dist/session-supervisor.js";

await test("neighboring saved trees are readable without loading models, starting runtimes or changing history", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-read-only-trees-"));
  const cwd = join(root, "workspace");
  await mkdir(cwd);
  const catalog = new JsonCatalogStore({ catalogFilePath: join(root, "catalogs.json") });
  let starts = 0;
  const supervisor = new SessionSupervisor({
    catalogStorage: catalog,
    createAgentSessionRuntimeImpl: async () => {
      starts++;
      throw new Error("Historical model is no longer configured");
    },
  });
  const workspace = await supervisor.registerWorkspace(cwd);
  const targets = [];
  for (let i = 0; i < 3; i++) {
    const manager = SessionManager.create(cwd, join(root, "sessions"));
    manager.appendModelChange("removed-provider", "removed-model");
    manager.appendMessage({ role: "user", content: `Question ${i}`, timestamp: Date.now() });
    const leaf = manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `Answer ${i}` }],
      api: "openai-completions",
      provider: "removed-provider",
      model: "removed-model",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    });
    const ref = { workspaceId: workspace.workspaceId, sessionId: manager.getSessionId() };
    const file = manager.getSessionFile()!;
    await catalog.sessions.upsertSession({
      sessionRef: ref,
      workspaceId: ref.workspaceId,
      title: `Saved ${i}`,
      updatedAt: new Date().toISOString(),
      status: "idle",
      sessionFilePath: file,
    });
    targets.push({ ref, file, leaf, content: await readFile(file, "utf8") });
  }
  const catalogBefore = await readFile(join(root, "catalogs.json"), "utf8");
  for (const target of targets) {
    const tree = await supervisor.getSessionTree(target.ref);
    assert.equal(tree.leafId, target.leaf);
    assert.match(JSON.stringify(tree), /Answer/);
    assert.equal(await readFile(target.file, "utf8"), target.content);
  }
  assert.equal(starts, 0);
  assert.equal(await readFile(join(root, "catalogs.json"), "utf8"), catalogBefore);
});
