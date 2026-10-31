import { createContext, createElement, useContext } from "react";
import type { ProcessEvent, ProcessFixture } from "./process-types";
import { laneStyle } from "./process-types";

export const ProcessDataContext = createContext<ProcessFixture | null>(null);
export function useProcessData(): ProcessFixture {
  const data = useContext(ProcessDataContext);
  if (!data) throw new Error("Process surface has no data source");
  return data;
}
export function ProcessActorIcon({ actor: id }: { readonly actor: string }) {
  const data = useProcessData();
  const keys = id.split("+");
  const icons = keys.map((key) => {
    const actor = data.actors.find((actor) => actor.id === key);
    const icon = data.icons[actor?.icon ?? "openai"];
    if (!icon) return null;
    return (
      <span className="ic" key={key} aria-hidden="true">
        <svg {...icon.attributes}>
          {icon.parts.map((part, i) => createElement(part.tag, { ...part.attributes, key: i }))}
        </svg>
        {actor?.badge ? <span className="bd">{actor.badge}</span> : null}
      </span>
    );
  });
  return keys.length > 1 ? <span className="pair">{icons}</span> : <>{icons}</>;
}
const GLYPHS: Readonly<Partial<Record<ProcessEvent["kind"], string>>> = {
  start: "gf",
  commit: "gc",
  handoff: "gd",
  checkpoint: "gr2",
  fork: "gf",
  artifact: "ga",
  tool: "gtl",
  xref: "gx",
};
export function ProcessGlyph({
  event,
  confirmed = false,
}: {
  readonly event: Pick<ProcessEvent, "kind" | "actor" | "fail" | "unverified">;
  readonly confirmed?: boolean;
}) {
  if (event.unverified) return <span className="ga" style={laneStyle("var(--tx3)")} />;
  switch (event.kind) {
    case "test":
      return <span className={`gt ${event.fail ? "x" : ""}`}>{event.fail ? "✕" : "✓"}</span>;
    case "review":
      return (
        <span className="gs">
          <svg viewBox="0 0 13 14">
            <path
              d="M6.5 1 L12 3 V7 C12 10 9.5 12.3 6.5 13 C3.5 12.3 1 10 1 7 V3 Z"
              fill="var(--lc)"
            />
            <path d="M4 7 L6 9 L9.3 5.2" fill="none" stroke="#fff" strokeWidth="1.5" />
          </svg>
        </span>
      );
    case "switch":
      return (
        <span className="gw">
          <ProcessActorIcon actor={event.actor} />
        </span>
      );
    case "compact":
      return <span className="gk">)(</span>;
    case "wait":
      return <span className={`gh ${confirmed ? "ok" : ""}`}>{confirmed ? "✓" : ""}</span>;
    case "error":
      return (
        <svg className="ge" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M8 4v4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="0.9" fill="#fff" />
        </svg>
      );
    case "retry":
      return <span className="gy">↻</span>;
    case "merge":
      return <span className="gc merge-glyph" />;
    default:
      return <span className={GLYPHS[event.kind] ?? "gc"} />;
  }
}
