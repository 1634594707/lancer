/** Reuse the existing Pi OAuth runtime or an OpenAI-compatible configured gateway. */
import OpenAI from "openai";
import { homedir } from "node:os";
import path from "node:path";
import { readJson, record, VideoPassError } from "./io";
import type { AnalysisOptions } from "./analysis";

type InputMessage =
  | { role: "system"; content: string }
  | {
      role: "user";
      content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[];
    };
export async function requestLearningModel(
  options: AnalysisOptions,
  modelId: string,
  messages: InputMessage[],
  signal: AbortSignal,
  maxTokens = 4096,
) {
  const provider = options.providerId;
  if (!provider || !modelId) throw new VideoPassError("E_MODEL_CONFIG");
  const agentDir = options.agentDir ?? path.join(homedir(), ".pi/agent");
  const settings = readJson(path.join(agentDir, "models.json"));
  const config = record(record(settings?.providers)?.[provider]);
  // Preserve explicitly configured OpenAI-compatible gateways; built-in providers
  // (including Claude and OAuth accounts) use pi's native authentication/runtime.
  // A models-only overlay can extend a built-in OAuth provider. It does not
  // turn that provider into a gateway or replace its authentication.
  const compatible =
    config &&
    typeof config.baseUrl === "string" &&
    config.baseUrl.length > 0 &&
    (config.api === undefined || config.api === "openai-completions");
  if (!options.fetch && !compatible) {
    const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
    const runtime = await ModelRuntime.create({
      authPath: path.join(agentDir, "auth.json"),
      modelsPath: path.join(agentDir, "models.json"),
      refreshOnCreate: false,
    });
    await runtime.refresh({ allowNetwork: false });
    const model = runtime.getModel(provider, modelId);
    if (!model) throw new VideoPassError("E_MODEL_CONFIG");
    const content = messages
      .filter((message) => message.role === "user")
      .flatMap((message) =>
        typeof message.content === "string"
          ? [{ type: "text" as const, text: message.content }]
          : message.content,
      );
    const converted = content.map((part) => {
      if (part.type === "text") return { type: "text" as const, text: part.text };
      if (
        part.type !== "image_url" ||
        !part.image_url.url.startsWith("data:image/jpeg;base64,") ||
        !model.input.includes("image")
      )
        throw new VideoPassError("E_MODEL_FAIL");
      return {
        type: "image" as const,
        mimeType: "image/jpeg",
        data: part.image_url.url.slice("data:image/jpeg;base64,".length),
      };
    });
    const response = await runtime.completeSimple(
      model,
      {
        systemPrompt: messages
          .filter((message) => message.role === "system")
          .map((message) => message.content)
          .join("\n"),
        messages: [{ role: "user", content: converted, timestamp: Date.now() }],
      },
      { signal, maxTokens, reasoning: "low" },
    );
    if (signal.aborted) throw new VideoPassError("E_TIMEOUT");
    if (response.stopReason !== "stop" || !response.responseId)
      throw new VideoPassError("E_MODEL_FAIL");
    return {
      id: response.responseId,
      model: response.model,
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: response.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n"),
            refusal: null,
          },
        },
      ],
    };
  }
  if (
    typeof config?.apiKey !== "string" ||
    !config.apiKey ||
    typeof config.baseUrl !== "string" ||
    !Array.isArray(config.models) ||
    !config.models.some((model) => record(model)?.id === modelId)
  )
    throw new VideoPassError("E_MODEL_FAIL");
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    maxRetries: 0,
    logLevel: "off",
    timeout: options.analysisTimeoutMs ?? 120000,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return client.chat.completions.create(
    { model: modelId, messages, max_tokens: maxTokens, temperature: 0 },
    { signal },
  );
}
