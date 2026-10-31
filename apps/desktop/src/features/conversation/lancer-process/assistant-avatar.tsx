import a0 from "./avatars/a0.png";
import a1 from "./avatars/a1.svg";
import a2 from "./avatars/a2.svg";

/** Local portraits for bot slots 0..2. The same identity always picks the same portrait. */
const ASSISTANT_AVATARS = [a0, a1, a2] as const;
export function assistantPortrait(key: string): string {
  return key.startsWith("data:image/") ? key : (ASSISTANT_AVATARS[Number(key.slice(1))] ?? a0);
}

export function assistantBotIndex(identity: string): 0 | 1 | 2 {
  let sum = 0;
  for (const char of identity) sum += char.charCodeAt(0);
  return (sum % ASSISTANT_AVATARS.length) as 0 | 1 | 2;
}

/** Stable, local assistant portrait; never a remote avatar request. */
export function ShellAssistantAvatar({
  identity,
  bot,
  avatar,
}: {
  readonly identity: string;
  readonly avatar?: string;
  /** Resident slots pass 0..2 so each pin keeps its own portrait. */
  readonly bot?: 0 | 1 | 2;
}) {
  const portrait = bot ?? assistantBotIndex(identity);
  return (
    <img
      className="shell-assistant-avatar"
      src={avatar ? assistantPortrait(avatar) : ASSISTANT_AVATARS[portrait]}
      alt=""
      data-bot={portrait}
      draggable={false}
    />
  );
}
