import { useEffect, useRef, useState } from "react";
import { FLIGHT_SECONDS, LANDING_SECONDS } from "./process-math";
import type { ProcessEvent } from "./process-types";

/** Historical baseline never emits. New identities get the replay's 1200ms flight
 * followed by its 600ms landing pulse, on an observation-time clock. */
export class LiveEmissionClock {
  private seen = new Set<string>();
  private starts = new Map<string, number>();
  private seeds = new Map<string, number>();
  constructor(private readonly random: () => number = Math.random) {}
  private initialized = false;
  observe(events: readonly ProcessEvent[], now: number): void {
    for (const event of events) {
      if (event.emits === false) continue;
      const identity = `${event.id}:${event.statusCode ?? ""}:${Boolean(event.running)}:${Boolean(event.fail)}`;
      if (this.initialized && !this.seen.has(identity)) {
        this.starts.set(event.id, now);
        this.seeds.set(event.id, this.random());
      }
      this.seen.add(identity);
    }
    this.initialized = true;
  }
  flightSeeds(): Record<string, number> {
    return Object.fromEntries(this.seeds);
  }
  sample(events: readonly ProcessEvent[], now: number): Record<string, number> {
    const times: Record<string, number> = {};
    for (const event of events) {
      const start = this.starts.get(event.id);
      if (start !== undefined && now - start < (FLIGHT_SECONDS + LANDING_SECONDS) * 1000)
        times[event.id] = event.time - FLIGHT_SECONDS + Math.max(0.001, (now - start) / 1000);
      else if (start !== undefined) this.starts.delete(event.id);
    }
    return times;
  }
}
export function useLiveEmissions(
  events: readonly ProcessEvent[],
  sessionKey: string,
  loading = false,
) {
  const clock = useRef<{ key: string; value: LiveEmissionClock } | null>(null);
  const [sample, setSample] = useState<{
    key: string;
    times: Readonly<Record<string, number>>;
    seeds?: Readonly<Record<string, number>>;
    sampledAt?: number;
  }>({ key: sessionKey, times: {} });
  useEffect(() => {
    // Hydration may start a render after the empty shell mounts. Discard that
    // empty baseline too, so loaded history cannot masquerade as new activity.
    if (loading || clock.current?.key !== sessionKey) {
      clock.current = { key: sessionKey, value: new LiveEmissionClock() };
      setSample({ key: sessionKey, times: {} });
    }
    if (loading) return;
    const value = clock.current!.value;
    value.observe(events, performance.now());
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSample({ key: sessionKey, times: {} });
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const now = performance.now();
      const times = value.sample(events, now);
      setSample({ key: sessionKey, times, seeds: value.flightSeeds(), sampledAt: now });
      // React owns phase changes only. The SVG layer interpolates its own frames.
      const boundaries = events.flatMap((event) => {
        const time = times[event.id];
        if (time === undefined) return [];
        const age = time - event.time;
        return [(age < 0 ? -age : LANDING_SECONDS - age) * 1000];
      });
      if (boundaries.length) timer = setTimeout(tick, Math.max(1, Math.min(...boundaries)));
    };
    tick();
    return () => clearTimeout(timer);
  }, [events, sessionKey, loading]);
  return sample.key === sessionKey && !loading ? sample : { key: sessionKey, times: {} };
}
