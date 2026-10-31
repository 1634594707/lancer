import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { videoLearnRuntimeOptions } from "../../electron/video-learn/runtime-options";
import { requestLearningModel } from "../../electron/video-learn/model-request";

test("video analysis uses the owning session model and does not invent a gateway or handoff", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lancer-video-options-"));
  const unconfigured = videoLearnRuntimeOptions(directory);
  expect(unconfigured.providerId).toBeUndefined();
  expect(unconfigured.modelId).toBeUndefined();
  expect(unconfigured.handoffModelId).toBeUndefined();
  const selected = videoLearnRuntimeOptions(directory, {
    provider: "anthropic",
    modelId: "chosen-vision-model",
  });
  expect(selected.providerId).toBe("anthropic");
  expect(selected.modelId).toBe("chosen-vision-model");
  await expect(
    requestLearningModel(unconfigured, "", [], new AbortController().signal),
  ).rejects.toThrow("E_MODEL_CONFIG");
});

test("explicit model overrides stay together and tool paths must be absolute", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lancer-video-overrides-"));
  const config = path.join(directory, "video-learn-tools.json");
  const selected = { provider: "previous-provider", modelId: "previous-model" };
  await writeFile(
    config,
    JSON.stringify({
      providerId: "explicit-provider",
      ffmpegPath: "relative/ffmpeg",
      ytDlpPath: "relative/yt-dlp",
    }),
  );
  expect(videoLearnRuntimeOptions(directory, selected)).toMatchObject({
    providerId: "explicit-provider",
    modelId: undefined,
    ffmpegPath: undefined,
    ytDlpPath: undefined,
  });
  await writeFile(config, JSON.stringify({ modelId: "explicit-model" }));
  expect(videoLearnRuntimeOptions(directory, selected)).toMatchObject({
    providerId: undefined,
    modelId: "explicit-model",
  });
  await writeFile(
    config,
    JSON.stringify({
      providerId: "explicit-provider",
      modelId: "explicit-model",
      handoffModelId: "second-model",
      ffmpegPath: path.join(directory, "ffmpeg"),
      ytDlpPath: path.join(directory, "yt-dlp"),
    }),
  );
  expect(videoLearnRuntimeOptions(directory, selected)).toMatchObject({
    providerId: "explicit-provider",
    modelId: "explicit-model",
    handoffModelId: "second-model",
    ffmpegPath: path.join(directory, "ffmpeg"),
    ytDlpPath: path.join(directory, "yt-dlp"),
  });
});

test("a models-only OAuth overlay still resolves through the native model registry", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lancer-video-oauth-"));
  await writeFile(path.join(directory, "auth.json"), "{}");
  await writeFile(
    path.join(directory, "models.json"),
    JSON.stringify({ providers: { "openai-codex": { models: [] } } }),
  );
  // An absent model must be rejected by the native registry before any request.
  // The old gateway path instead demanded a static API key and returned E_MODEL_FAIL.
  await expect(
    requestLearningModel(
      { agentDir: directory, providerId: "openai-codex" },
      "missing-video-test-model",
      [],
      new AbortController().signal,
    ),
  ).rejects.toThrow("E_MODEL_CONFIG");
});
