#!/usr/bin/env node
import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("./lancer-ctl.mjs", import.meta.url));
const usage = `Usage: lancer-ctl-dash [--user-data-dir path] [--port 0..65535] [--no-open]

Read-only live dashboard for the running Lancer. Opens your default browser.
Refreshes sessions and the selected session's recent tools/assistant text every second.
Uses the same local control API/profile as lancer-ctl (including LANCER_USER_DATA_DIR).
Defaults to a random loopback port. Ctrl+C stops only this dashboard, not any session.
Requires Node 22+ and Settings > General > Allow local control API enabled.`;

// Reuse the CLI transport/authentication instead of introducing another session owner.
export async function startDashboard({ directory, port = 0 } = {}) {
  const children = new Set();
  const pending = new Map();
  let stopped = false;
  async function query(command, session) {
    const key = JSON.stringify([command, session]);
    if (pending.has(key)) return pending.get(key);
    if (stopped || pending.size >= 8) throw new Error("Dashboard is busy; retry shortly");
    const args = [cli, command, "--json"];
    if (session !== undefined) args.push("-n", "40");
    if (directory) args.push("--user-data-dir", directory);
    // End option parsing so even unusual workspace/session IDs stay positional.
    if (session !== undefined) args.push("--", session);
    const job = exec(process.execPath, args, { timeout: 35_000, maxBuffer: 32 * 1024 * 1024 });
    children.add(job.child);
    const result = job
      .then(({ stdout }) => JSON.parse(stdout))
      .catch((error) => {
        throw new Error(error.stderr?.trim() || error.message);
      })
      .finally(() => {
        pending.delete(key);
        children.delete(job.child);
      });
    pending.set(key, result);
    return result;
  }
  // Fail fast on a disabled API/missing profile, before opening an empty browser page.
  await query("sessions");
  const assets = new Map(
    await Promise.all(
      [
        ["", "page.html", "text/html"],
        ["dashboard.js", "dashboard.js", "text/javascript"],
        ["dashboard.css", "dashboard.css", "text/css"],
      ].map(async ([route, file, type]) => [
        route,
        { body: await readFile(new URL(`./lancer-ctl-dashboard/${file}`, import.meta.url)), type },
      ]),
    ),
  );
  // This temporary read-only capability is NOT the desktop control token.
  const prefix = `/${randomBytes(24).toString("hex")}/`;
  let origin;
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const json = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(value));
    };
    if (
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      json(403, { error: "Only same-origin dashboard access is allowed" });
      return;
    }
    let url;
    try {
      url = new URL(req.url, origin);
    } catch {
      json(400, { error: "Invalid URL" });
      return;
    }
    if (url.origin !== origin || req.method !== "GET" || !url.pathname.startsWith(prefix)) {
      json(404, { error: "Not found" });
      return;
    }
    const route = url.pathname.slice(prefix.length);
    const asset = assets.get(route);
    if (asset) {
      res.writeHead(200, { "Content-Type": `${asset.type}; charset=utf-8` });
      res.end(asset.body);
      return;
    }
    try {
      if (route === "api/sessions") {
        json(200, await query("sessions"));
      } else if (route === "api/tail") {
        const session = url.searchParams.get("session");
        if (!session || session.length > 8192) {
          json(400, { error: "A full session ID is required" });
          return;
        }
        const tail = await query("tail", session);
        // Tool arguments are not needed here. Do not forward raw input/attachments.
        json(200, {
          session: tail.session,
          error: tail.error,
          lastAssistant: tail.lastAssistant?.slice(-12_000) ?? null,
          messages: tail.messages.map((item) => ({
            id: item.id,
            kind: item.kind,
            role: item.role,
            status: item.status,
            toolName: item.toolName,
            createdAt: item.createdAt,
            text: String(item.text ?? item.label ?? "").slice(-4000),
          })),
        });
      } else json(404, { error: "Not found" });
    } catch (error) {
      json(502, { error: error.message });
    }
  });
  server.requestTimeout = 40_000;
  server.headersTimeout = 5000;
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", done);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    server,
    url: `${origin}${prefix}`,
    async close() {
      stopped = true;
      for (const child of children) child.kill();
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    },
  };
}

async function main(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }
  const options = {};
  let open = true;
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (seen.has(option)) throw new Error(`Duplicate option: ${option}`);
    seen.add(option);
    if (option === "--no-open") open = false;
    else if (
      ["--port", "--user-data-dir"].includes(option) &&
      args[i + 1] &&
      !args[i + 1].startsWith("--")
    ) {
      const value = args[++i];
      if (option === "--user-data-dir") options.directory = resolve(value);
      else {
        if (!/^\d+$/.test(value) || Number(value) > 65535)
          throw new Error("--port must be 0..65535");
        options.port = Number(value);
      }
    } else throw new Error(`Invalid option: ${option}\n${usage}`);
  }
  const dashboard = await startDashboard(options);
  console.log(`Lancer live dashboard: ${dashboard.url}\nRead-only · refresh 1s · Ctrl+C to close`);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      dashboard.close().catch((error) => console.error(error.message));
    });
  }
  if (open) {
    const [command, args] =
      process.platform === "darwin" ? ["open", [dashboard.url]] : ["xdg-open", [dashboard.url]];
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => console.error("Could not open browser; use the URL above."));
    child.on("exit", (code) => {
      if (code) console.error("Could not open browser; use the URL above.");
    });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`lancer-ctl-dash: ${error.message}`);
    process.exitCode = 1;
  });
}
