# Live emitted light

The light Lancer conversation now uses the original replay cubic, easing, gradient tail,
glow and moving head: 1200 ms flight, then a 600 ms landing pulse.

- A visible assistant/stage header emits toward its own work-tree event.
- If chat is clipped or absent, the visible lane-head model is the semantic chip source.
  The shell hides the old relay strip; hidden duplicate anchors no longer mask this source.
- Session/transcript hydration establishes a silent baseline. Refreshing or reopening history
  does not emit it again. Reduced-motion mode suppresses flights and pulses.
- No IPC/runtime changes, new animation implementation, sidebar or thinking-control edits.

## Local verification

Start the desktop with `pnpm --filter @lancer/desktop dev`, choose the light theme,
open a real session and send a prompt. Keep the newest assistant response and its tree node
visible. A lane-colored light travels from the response header to that exact node, followed
by a fading ring. Refresh: history must remain still. Enable Reduce Motion: new responses
must not animate. A clipped tree target does not get substituted with another node.

Repeatable credential-free Electron/runtime regression, including original replay,
real-model chip fallback, cross-pane chat flight, landing, hydration and reduced motion:

```sh
PI_APP_REAL_AUTH=0 PI_APP_TEST_MODE=background PI_APP_TEST_WORKERS=1 \
pnpm --filter @lancer/desktop run test:e2e:runner -- \
  apps/desktop/tests/core/process-live-flight.spec.ts \
  apps/desktop/tests/core/process-flight-proof.spec.ts \
  --output=.artifacts/live-flight/core-new --trace=on
```

Visible external-provider proof (two small real requests; requires configured credentials):

```sh
PI_APP_REAL_AUTH=1 PI_APP_REAL_AUTH_SOURCE_DIR="$HOME/.pi/agent" \
PI_GUI_PROVIDER=openai-codex PI_GUI_MODEL=gpt-6.1-sol PI_APP_TEST_WORKERS=1 \
pnpm --filter @lancer/desktop run test:e2e:runner -- \
  apps/desktop/tests/live/process-live-flight.spec.ts \
  --output=.artifacts/live-flight/provider-new --trace=on
```

Use a fresh output directory each time and serialize builds/Electron foreground ownership.
The provider proof checks the owned main window by URL (not window array order, which may
include pi-orb), visible/focused state, isolated profile, absent test hooks and real responses.

## Observed verification

- Core/replay: 2 passed in `.artifacts/live-flight/core-final/`.
- Visible real `openai-codex/gpt-6.1-sol`: passed in
  `.artifacts/live-flight/provider-3/`; doctor and cleanup JSON, screenshots, trace and
  `real-live-flight.json` retained. 100 painted flight samples, both chat and chip sources;
  maximum cubic endpoint error 0 px, traveling-head landing error 0.258 px.
- Scoped unit tests: 33 passed. Full desktop units: 402 passed, 1 capability skip;
  video-process fixture failed because local ffmpeg cannot load `libssl.3.dylib`, leaving
  its 15 subsequent tests unrun. This is not a full unit pass.
- Repository lint, architecture and typecheck passed. `pnpm check` stops at formatting of
  pre-existing `apps/desktop/{IPC-INVENTORY,OWNERS,STRUCTURE-ALIGN}.md`.
  Separate baseline also stops at the existing pi-orb IPC main-frame guard violation.
- Earlier failed attempts are retained under `.artifacts/live-flight/`: source invisibility
  and historical re-emission were reproduced and fixed; language/focus/doctor setup failures
  are not counted as passes. No installed/packaged app or full-conversation/Stop claim.
