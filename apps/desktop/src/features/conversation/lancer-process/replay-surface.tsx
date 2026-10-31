import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { REPLAY_FIXTURE } from "./replay-fixture";
import { fiveLaneReplayFixture } from "./replay-five-lanes";
import { REPLAY_TIMING } from "./replay-timing";
import { currentActor } from "./process-math";
import { LancerProcessSurface } from "./process-surface";
import { ReplayPointer } from "./replay-pointer";
import type { ProcessSurfaceActions, ProcessViewState } from "./process-types";
import type { TimelineViewport } from "../hooks/use-timeline-viewport";

export interface LancerReplayApi {
  seek(seconds: number): Promise<{
    readonly seconds: number;
    readonly time: number;
    readonly scrollTop: number;
    readonly lane: string;
    readonly anchorError: number | null;
    readonly anchorClamped: boolean;
  }>;
}
declare global {
  interface Window {
    lancerReplay?: LancerReplayApi;
  }
}
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
export function replayFrame(seconds: number): ProcessViewState {
  const index = Math.max(0, Math.min(REPLAY_TIMING.length - 1, Math.floor(seconds * 2)));
  const a = REPLAY_TIMING[index]!,
    b = REPLAY_TIMING[Math.min(index + 1, REPLAY_TIMING.length - 1)]!;
  const fraction = Math.min(1, (seconds - a.seconds) / 0.5);
  return {
    time: a.time + (b.time - a.time) * fraction,
    lane: seconds >= 40.8 ? "all" : seconds >= 28.8 ? "r" : a.lane,
    focus: seconds >= 40.8 ? "" : seconds >= 28.8 ? "r" : a.focus,
    highlighted:
      seconds >= 44.8
        ? "ev27"
        : seconds >= 28.8
          ? "ev37"
          : seconds >= 22.2
            ? "ev12"
            : seconds >= 13.8
              ? "ev22"
              : null,
    traceSelection: false,
    open: new Set([
      ...(seconds >= 13.8 ? ["ev22"] : []),
      // Step groups now start expanded; these keys record a user collapse.
      // Keep the authored disclosure moments without forcing native groups open.
      ...(seconds < 15.8 ? ["gev22"] : []),
      ...(seconds >= 17.8 ? ["sev22_2"] : []),
      ...(seconds >= 22.2 ? ["ev12"] : []),
      ...(seconds >= 28.8 ? ["ev37"] : []),
      ...(seconds < 31.35 ? ["gev37"] : []),
      ...(seconds >= 33.2 ? ["sev37_2"] : []),
      ...(seconds >= 44.8 ? ["ev27"] : []),
    ]),
  };
}
const reelFrames: number[] = [];
for (let i = 0, position = 0; i <= 56 * 60; i++) {
  const state = replayFrame(i / 60),
    actor = currentActor(REPLAY_FIXTURE, state),
    target = Math.max(0, REPLAY_FIXTURE.reel.indexOf(actor));
  if (!i) position = target;
  else position += (target - position) * 0.085;
  if (Math.abs(target - position) < 0.002) position = target;
  reelFrames.push(position);
}

/** Read-only renderer fixture: no catalog writes, no provider requests, no broad preload
 * test hooks. It drives exactly the same process components as the native session view. */
export function LancerReplaySurface() {
  const [data] = useState(() =>
    new URLSearchParams(location.search).get("replay-five-lanes") === "1"
      ? fiveLaneReplayFixture()
      : REPLAY_FIXTURE,
  );
  const [seconds, setSeconds] = useState(0);
  const [override, setOverride] = useState<Partial<ProcessViewState>>({});
  const viewport = useRef<TimelineViewport | null>(null);
  const onViewport = useCallback((value: TimelineViewport) => {
    viewport.current = value;
  }, []);
  const state = {
    ...replayFrame(seconds),
    reelPosition: reelFrames[Math.min(reelFrames.length - 1, Math.round(seconds * 60))],
    ...override,
  };
  useEffect(() => {
    const api: LancerReplayApi = {
      seek: async (value) => {
        const next = Math.min(55.999, Math.max(0, value));
        flushSync(() => {
          setOverride({});
          setSeconds(next);
        });
        for (let i = 0; i < 4; i++) await nextFrame();
        const index = Math.min(REPLAY_TIMING.length - 1, Math.floor(next * 2));
        const a = REPLAY_TIMING[index]!,
          b = REPLAY_TIMING[Math.min(index + 1, REPLAY_TIMING.length - 1)]!;
        const anchor = a.anchor;
        const element = anchor
          ? document.querySelector<HTMLElement>(`.lancer-process ${anchor.selector}`)
          : null;
        const pane = document.querySelector<HTMLElement>(
          ".lancer-process [data-testid='timeline-pane']",
        );
        let anchorError: number | null = null;
        let anchorClamped = false;
        if (element && pane && anchor) {
          // The source's 31.35s disclosure changes height and reading position
          // together. Interpolating before it opens scrolls the collapsed list.
          const fraction =
            a.seconds === 31 ? Number(next >= 31.35) : Math.min(1, (next - a.seconds) / 0.5);
          const y =
            b.anchor?.selector === anchor.selector
              ? anchor.y + (b.anchor.y - anchor.y) * fraction
              : anchor.y;
          // A measurement can trigger a second layout (expanded stages and lane
          // changes). Re-anchor against the committed DOM, never the previous
          // seek's reading position. All writes still belong to the viewport.
          for (let pass = 0; pass < 4; pass++) {
            const desired = pane.scrollTop + element.getBoundingClientRect().top - y;
            const maximum = Math.max(0, pane.scrollHeight - pane.clientHeight);
            const target = Math.max(0, Math.min(maximum, desired));
            anchorClamped = Math.abs(target - desired) > 0.5;
            viewport.current?.navigateToOffset(target);
            await nextFrame();
            await nextFrame();
            if (Math.abs(pane.scrollTop - target) <= 0.5 && pane.dataset.layout === "settled")
              break;
          }
          anchorError = element.getBoundingClientRect().top - y;
        } else if (next < 14) viewport.current?.navigateToOffset(0);
        for (let i = 0; i < 4; i++) await nextFrame();
        return {
          seconds: next,
          time: replayFrame(next).time,
          scrollTop: pane?.scrollTop ?? 0,
          lane: replayFrame(next).lane,
          anchorError,
          anchorClamped,
        };
      },
    };
    window.lancerReplay = api;
    return () => {
      if (window.lancerReplay === api) delete window.lancerReplay;
    };
  }, []);
  const actions: ProcessSurfaceActions = {
    onToggle: (id) =>
      setOverride((current) => {
        const open = new Set(current.open ?? state.open);
        if (open.has(id)) open.delete(id);
        else open.add(id);
        const event = data.events.find((event) => event.id === id);
        return {
          ...current,
          open,
          ...(event ? { highlighted: open.has(id) ? event.id : null, traceSelection: true } : {}),
        };
      }),
    onSelectLane: (lane) =>
      setOverride((current) => ({ ...current, lane, focus: lane === "all" ? "" : lane })),
    onSelectSession: (id) => {
      const lane = REPLAY_FIXTURE.sidebar.findIndex((group) =>
        group.sessions.some((session) => session.id === id),
      );
      if (lane >= 0)
        setOverride((current) => ({
          ...current,
          lane: REPLAY_FIXTURE.lanes[lane]!.id,
          focus: REPLAY_FIXTURE.lanes[lane]!.id,
        }));
    },
    onSelectEvent: (id, hover) => {
      if (hover) {
        setOverride((current) => ({ ...current, hovered: id || null }));
        return;
      }
      const event = data.events.find((event) => event.id === id);
      if (!event) return;
      setOverride((current) => ({
        ...current,
        highlighted: id,
        traceSelection: true,
        lane: state.lane === "all" ? "all" : event.lane,
        focus: state.lane === "all" ? "" : event.lane,
        open: new Set([...(current.open ?? state.open), id]),
      }));
      requestAnimationFrame(() => viewport.current?.navigateToRow(id));
    },
    onLaunch: () => setSeconds((current) => Math.min(55.5, current + 1)),
  };
  return (
    <>
      <LancerProcessSurface
        data={data}
        state={state}
        actions={actions}
        sessionKey="read-only-replay"
        onViewport={onViewport}
        emissions
        graphHeight={584}
      />
      <ReplayPointer seconds={seconds} />
    </>
  );
}
