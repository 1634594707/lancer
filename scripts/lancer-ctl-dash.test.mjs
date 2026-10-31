import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startDashboard } from "./lancer-ctl-dash.mjs";

const exec = promisify(execFile);
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "lancer-dash-"));
  const token = "private-control-token-must-not-reach-browser";
  await writeFile(join(directory, "control.token"), token);
  const session = {
    id: "lane-id",
    workspaceId: "/workspace/with spaces",
    title: "<img src=x onerror=alert(1)>",
    model: "provider/model",
    status: "running",
    cwd: "/workspace/with spaces",
    zone: "Lancer",
    updatedAt: new Date().toISOString(),
    lastLine: "tool: read",
  };
  const calls = [];
  let failed = false;
  const control = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    assert.equal(req.url, "/v1");
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    calls.push(input);
    if (failed) {
      res.end(JSON.stringify({ ok: false, error: { code: "DISABLED", message: "API disabled" } }));
      return;
    }
    const result =
      input.operation === "sessions"
        ? { sessions: [session] }
        : {
            session,
            lastAssistant: "Assistant activity ".repeat(1000),
            messages: [
              {
                id: "tool-1",
                kind: "tool",
                toolName: "bash",
                status: "running",
                label: "Read file",
                input: { password: "not-for-browser" },
              },
              { id: "assistant-1", kind: "message", role: "assistant", text: "hello" },
            ],
          };
    res.end(JSON.stringify({ ok: true, result }));
  });
  await new Promise((done) => control.listen(join(directory, "control.sock"), done));
  t.after(() => {
    control.closeAllConnections();
    control.close();
  });
  const dashboard = await startDashboard({ directory });
  t.after(() => dashboard.close());
  return {
    ...dashboard,
    directory,
    session,
    calls,
    fail: (value) => {
      failed = value;
    },
  };
}

test("dashboard serves local assets and reads the existing authenticated CLI/API only", async (t) => {
  const { url, calls, session } = await fixture(t);
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{48}\/$/);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.match(await page.text(), /Live lanes/);
  for (const file of ["dashboard.js", "dashboard.css"])
    assert.equal((await fetch(url + file)).status, 200);
  const list = await (await fetch(url + "api/sessions")).json();
  assert.deepEqual(list.sessions, [session]);
  const selector = `${session.workspaceId}:${session.id}`;
  const tailResponse = await fetch(url + "api/tail?session=" + encodeURIComponent(selector));
  const text = await tailResponse.text();
  const tail = JSON.parse(text);
  assert.equal(tail.messages[0].text, "Read file");
  assert.equal(tail.messages[1].text, "hello");
  assert.equal(tail.lastAssistant.length, 12000);
  assert.ok(!text.includes("not-for-browser"));
  assert.ok(!text.includes("private-control-token"));
  assert.deepEqual(calls.at(-1), { operation: "tail", session: selector, n: 40 });
  assert.ok(calls.every((call) => ["sessions", "tail"].includes(call.operation)));
});

test("capability, origin, method, and route checks reject arbitrary/mutating requests", async (t) => {
  const { url, calls } = await fixture(t);
  const before = calls.length;
  const origin = new URL(url).origin;
  const cases = [
    [origin + "/", {}, 404],
    [url + "api/send", {}, 404],
    [url + "api/sessions", { method: "POST", body: "{}" }, 404],
    [url + "api/sessions", { headers: { Origin: "https://evil.example" } }, 403],
    [url + "api/sessions", { headers: { "Sec-Fetch-Site": "cross-site" } }, 403],
    [url + "api/tail", {}, 400],
  ];
  for (const [target, options, expected] of cases) {
    const response = await fetch(target, options);
    assert.equal(response.status, expected, target);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    await response.text();
  }
  const badHost = await new Promise((done, reject) => {
    const req = request(url, { headers: { Host: "evil.example" } }, (res) => {
      res.resume();
      done(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(badHost, 403);
  const malformed = await new Promise((done, reject) => {
    const req = request(url, { path: "http://[" }, (res) => {
      res.resume();
      done(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(malformed, 400);
  assert.equal(calls.length, before);
});

test("backend errors are visible, recover without replaying mutations, IDs cannot inject CLI flags", async (t) => {
  const { url, calls, fail } = await fixture(t);
  fail(true);
  const failed = await fetch(url + "api/sessions");
  assert.equal(failed.status, 502);
  assert.match((await failed.json()).error, /DISABLED/);
  fail(false);
  assert.equal((await fetch(url + "api/sessions")).status, 200);
  const selector = "--user-data-dir /do-not-use";
  assert.equal((await fetch(url + "api/tail?session=" + encodeURIComponent(selector))).status, 200);
  assert.equal(calls.at(-1).session, selector);
});

test("parallel browser refreshes share one read; an occupied port fails without replacing its owner", async (t) => {
  const { url, directory, server, calls } = await fixture(t);
  const before = calls.length;
  const responses = await Promise.all(Array.from({ length: 5 }, () => fetch(url + "api/sessions")));
  for (const response of responses) {
    assert.equal(response.status, 200);
    await response.text();
  }
  assert.equal(calls.length - before, 1);
  await assert.rejects(startDashboard({ directory, port: server.address().port }), {
    code: "EADDRINUSE",
  });
  assert.equal((await fetch(url)).status, 200);
});

test("launcher help and argument errors need no profile; missing profile fails before listening", async () => {
  const cli = resolve("scripts/lancer-ctl-dash.mjs");
  const { stdout } = await exec(process.execPath, [cli, "--help"]);
  assert.match(stdout, /--no-open/);
  assert.match(stdout, /--user-data-dir/);
  for (const args of [
    ["--port", "-1"],
    ["--port", "65536"],
    ["--port", "NaN"],
    ["--wat"],
    ["--user-data-dir", "--no-open"],
    ["--port", "0", "--port", "0"],
  ]) {
    await assert.rejects(exec(process.execPath, [cli, ...args]));
  }
  const empty = await mkdtemp(join(tmpdir(), "lancer-dash-missing-"));
  await assert.rejects(startDashboard({ directory: empty }), /not running.*local control/);
});
