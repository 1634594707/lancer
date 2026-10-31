/** Preserve upstream structured partial results for live terminal observers. */
export function toolUpdateText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || !("content" in value) || !Array.isArray(value.content))
    return undefined;
  return (value.content as unknown[])
    .flatMap((part) => {
      if (
        !part ||
        typeof part !== "object" ||
        !("type" in part) ||
        part.type !== "text" ||
        !("text" in part) ||
        typeof part.text !== "string"
      )
        return [];
      return [part.text];
    })
    .join("\n");
}
