import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { DoubaoAppVideo } from "../../contracts/doubao-app";
import type { NativeDoubaoCall } from "./native-client";
import { sha256File } from "../video-learn/io";

export async function assertDownloadDirectory(root: string, directory: string): Promise<string> {
  const realRoot = await realpath(root);
  const realDirectory = await realpath(directory);
  const relative = path.relative(realRoot, realDirectory);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    realDirectory !== directory
  )
    throw new Error("E_DOWNLOAD_PATH");
  return realDirectory;
}
export async function createDownloadDirectory(root: string, key: string): Promise<string> {
  let directory = await realpath(root);
  for (const segment of [".lancer", "doubao", key, "downloads"]) {
    directory = path.join(directory, segment);
    try {
      await mkdir(directory);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
        throw error;
    }
    const entry = await lstat(directory);
    if (!entry.isDirectory() || entry.isSymbolicLink() || (await realpath(directory)) !== directory)
      throw new Error("E_DOWNLOAD_PATH");
  }
  return directory;
}
export class DoubaoVideoReceiver {
  private readonly cache = new Map<string, { signature: string; video: DoubaoAppVideo }>();
  constructor(private readonly inspect: NativeDoubaoCall) {}
  async verify(
    root: string,
    directory: string,
    name: string,
    force = false,
  ): Promise<DoubaoAppVideo | null> {
    await assertDownloadDirectory(root, directory);
    if (name !== path.basename(name) || !/\.(mp4|mov|mkv|webm)$/i.test(name))
      throw new Error("E_DOWNLOAD_PATH");
    const file = path.join(directory, name);
    const before = await lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || (await realpath(file)) !== file)
      throw new Error("E_DOWNLOAD_PATH");
    if (before.size <= 0 || Date.now() - before.mtimeMs < 2000) return null;
    const signature = `${before.dev}:${before.ino}:${before.size}:${before.mtimeMs}:${before.ctimeMs}`;
    const cached = this.cache.get(file);
    if (!force && cached?.signature === signature) return cached.video;
    const media = await this.inspect({ action: "inspectVideo", path: file });
    if (!media.ok || !media.hasVideo || !media.durationMs || media.durationMs <= 0)
      throw new Error("E_NOT_VIDEO");
    const sha256 = await sha256File(file);
    const after = await lstat(file);
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ino !== before.ino ||
      after.ctimeMs !== before.ctimeMs
    )
      return null;
    const video = {
      id: createHash("sha256").update(name).digest("hex").slice(0, 24),
      name,
      path: file,
      sha256,
      bytes: after.size,
      durationMs: media.durationMs,
    };
    this.cache.set(file, { signature, video });
    return video;
  }
  async receive(root: string, directory: string): Promise<readonly DoubaoAppVideo[]> {
    await assertDownloadDirectory(root, directory);
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.length > 1000) throw new Error("E_DOWNLOAD_LIMIT");
    const videos: DoubaoAppVideo[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(mp4|mov|mkv|webm)$/i.test(entry.name)) continue;
      const video = await this.verify(root, directory, entry.name);
      if (video) videos.push(video);
    }
    return videos;
  }
}
