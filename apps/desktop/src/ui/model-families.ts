export const MODEL_FAMILIES = [
  { id: "openai", label: "GPT", match: /openai|gpt|\bo[134]/i },
  { id: "claude", label: "Claude", match: /anthropic|claude|opus|sonnet/i },
  { id: "grok", label: "Grok", match: /xai|grok/i },
  { id: "gemini", label: "Gemini", match: /google|gemini/i },
  { id: "doubao", label: "豆包", match: /volcengine|doubao/i },
  { id: "kimi", label: "Kimi", match: /moonshot|kimi/i },
  { id: "deepseek", label: "DeepSeek", match: /deepseek/i },
  { id: "qwen", label: "Qwen", match: /qwen|alibaba/i },
  { id: "zhipu", label: "GLM", match: /zhipu|zai|z-ai|glm/i },
] as const;
const MODEL_NAMES = [
  /gpt|\bo[134](?:\b|[-_])/i,
  /claude|opus|sonnet|haiku/i,
  /grok/i,
  /gemini/i,
  /doubao/i,
  /kimi/i,
  /deepseek/i,
  /qwen/i,
  /glm/i,
];

/** Transport providers (including OpenAI-compatible gateways) do not determine
 * model identity when the actual model or its catalog label identifies a family. */
export function modelFamily(provider = "", modelId = "", label = "") {
  for (const name of [modelId, label]) {
    const index = MODEL_NAMES.findIndex((pattern) => pattern.test(name));
    if (index >= 0) return MODEL_FAMILIES[index];
  }
  return MODEL_FAMILIES.find((family) => family.match.test(provider));
}
