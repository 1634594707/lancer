import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONVENTION_ROOT = path.resolve(__dirname, "../..");

/** Resolve Lancer project runtime root (where inbox/raw/learning live). */
export function resolveProjectRoot(argv = process.argv.slice(2)) {
  const i = argv.indexOf("--project-root");
  if (i >= 0 && argv[i + 1]) return path.resolve(argv[i + 1]);
  if (process.env.LANCER_PROJECT_ROOT) return path.resolve(process.env.LANCER_PROJECT_ROOT);
  // default: cwd if it looks like a project, else convention examples
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "inbox")) || fs.existsSync(path.join(cwd, "raw"))) return cwd;
  return cwd;
}

export function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

export function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}

export function nowIsoShanghai() {
  // Asia/Shanghai wall clock via offset label in string; Node ISO is fine with +08:00
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+08:00`;
}

export function schemaPath(name) {
  return path.join(CONVENTION_ROOT, "schemas", name);
}
