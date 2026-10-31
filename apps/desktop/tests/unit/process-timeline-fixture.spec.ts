import { mkdtemp, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";
import {
  makeWorkspace,
  seedAgentDir,
  seedProcessTimelineDemoFixture,
} from "../helpers/electron-app";

test("process timeline demo fixture seeds multiple sessions per workspace", async () => {
  const userData = await mkdtemp(join(tmpdir(), "fixture-"));
  const agentDir = join(userData, "agent");
  await seedAgentDir(agentDir);
  const workspacePath = await makeWorkspace("fixture-ws");
  const fixture = await seedProcessTimelineDemoFixture(agentDir, workspacePath);

  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const { SessionManager } = await import("@earendil-works/pi-coding-agent");
    const sessions = await SessionManager.list(workspacePath);
    const sessionsRoot = join(agentDir, "sessions");
    const sessionDirs = await readdir(sessionsRoot);
    const jsonlCounts = await Promise.all(
      sessionDirs.map(async (dir) => {
        const files = await readdir(join(sessionsRoot, dir));
        return files.filter((file) => file.endsWith(".jsonl")).length;
      }),
    );
    expect(jsonlCounts.reduce((sum, count) => sum + count, 0)).toBeGreaterThanOrEqual(
      1 + fixture.siblingSessions.length,
    );
    expect(sessions.length).toBeGreaterThanOrEqual(1 + fixture.siblingSessions.length);
    for (const sibling of fixture.siblingSessions) {
      expect(
        sessions.find((session) => session.id === sibling.sessionId)?.messageCount,
      ).toBeGreaterThanOrEqual(10);
    }
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  }
});
