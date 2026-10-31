import type { ProcessSidebarGroup } from "./process-types";

/** Left-rail resident portraits: a0 Saber, a1 Rin, a2 Sakura. */
export const RESIDENT_SLOT_COUNT = 3;

export type ResidentSession = ProcessSidebarGroup["sessions"][number];

export interface ResidentPin {
  /** Portrait slot. This is the photo, independent of the session actor. */
  readonly bot: 0 | 1 | 2;
  readonly session: ResidentSession | null;
}

/**
 * Three stable portrait slots.
 *
 * Module heads used to become one pin each. Live sessions often share the
 * default actor (`sol`), and that identity hashes to portrait 1, so four
 * modules painted four copies of the same Rin photo. Slots are the portraits:
 * index 0/1/2 always show a0/a1/a2. Sessions fill those slots in sidebar
 * order (one head per module, then later sessions in the same order) and
 * never change which photo a slot shows.
 */
export function residentPins(sidebar: readonly ProcessSidebarGroup[]): readonly ResidentPin[] {
  const chosen: ResidentSession[] = [];
  const seen = new Set<string>();
  const take = (session: ResidentSession | undefined) => {
    if (!session || seen.has(session.id) || chosen.length >= RESIDENT_SLOT_COUNT) return;
    seen.add(session.id);
    chosen.push(session);
  };
  for (const group of sidebar) take(group.sessions[0]);
  for (const group of sidebar) {
    for (const session of group.sessions) take(session);
  }
  return [0, 1, 2].map((bot) => ({
    bot: bot as 0 | 1 | 2,
    session: chosen[bot] ?? null,
  }));
}

/**
 * Portrait for a session row. A session that is itself a resident pin uses
 * that pin. Every other session uses the pin that represents its module
 * (the earliest pin whose session lives in that module). A module with no
 * pin, such as a fourth group after the three heads are taken, uses its
 * sidebar index modulo 3.
 */
export function residentBotForSession(
  sidebar: readonly ProcessSidebarGroup[],
  sessionId: string,
): 0 | 1 | 2 {
  return residentBotBySession(sidebar).get(sessionId) ?? 0;
}

export function residentBotBySession(
  sidebar: readonly ProcessSidebarGroup[],
): ReadonlyMap<string, 0 | 1 | 2> {
  const pins = residentPins(sidebar);
  const bots = new Map<string, 0 | 1 | 2>();
  sidebar.forEach((group, groupIndex) => {
    const modulePin = pins.find(
      (pin) => pin.session && group.sessions.some((session) => session.id === pin.session?.id),
    );
    const moduleBot = modulePin?.bot ?? ((groupIndex % RESIDENT_SLOT_COUNT) as 0 | 1 | 2);
    for (const session of group.sessions) bots.set(session.id, moduleBot);
  });
  for (const pin of pins) {
    if (pin.session) bots.set(pin.session.id, pin.bot);
  }
  return bots;
}
