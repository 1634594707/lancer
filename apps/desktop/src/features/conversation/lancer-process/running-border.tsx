import "@lancer/light-ui/running-border.css";
/** Decorative only; the enclosing message/phase carries the execution state. */
export function RunningBorder({ radius = 5 }: { readonly radius?: number }) {
  return (
    <svg
      className="process-running-border light-running-border"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="1"
        y="1"
        width="calc(100% - 2px)"
        height="calc(100% - 2px)"
        rx={radius}
        pathLength="100"
      />
    </svg>
  );
}
