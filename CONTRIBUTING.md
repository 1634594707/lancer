# Contributing to Lancer

Thanks for your interest in improving Lancer. This guide covers local setup, the
test lanes, and what "done" means for a change.

## Prerequisites

- Node >=22.19.0 <26 (Node 24 recommended)
- [pnpm](https://pnpm.io), managed through `corepack`; `pnpm-lock.yaml` is the
  authoritative lockfile

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run doctor
```

## Development loop

```bash
pnpm dev         # run the desktop app (electron-vite, hot reload)
pnpm typecheck   # type-check all workspaces
pnpm lint        # lint all workspaces
pnpm build       # build all workspaces
```

`pnpm dev` rebuilds the shared workspace packages up front and keeps them in watch
mode, so Node-side package changes are picked up without a manual rebuild.

## Testing

The baseline and Core suites decode generated test media. Install working FFmpeg
and FFprobe before running them (`ffmpeg -version`, `ffprobe -version`), or set
`FFMPEG` and `FFPROBE` to their executable paths. They are not needed just to
start the chat app. Do not skip these checks because a media binary is missing.

Desktop end-to-end tests run against a real Electron build using a Playwright +
Electron harness, split into lanes:

- `core` — the default lane, runs on `pnpm test`.
- `live` — exercises live agent runs; needs working `pi` provider auth locally.
- `native` — foreground/OS-integration behaviors (open folder, paste, attachments).

```bash
pnpm test                                        # each workspace's tests (desktop: core lane)
pnpm --filter @lancer/desktop run test:e2e:all   # core + live + native
```

macOS Apple Silicon is the primary local verification platform. Linux Core CI
checks do not replace native operating-system or packaged-app validation. See
[`apps/desktop/README.md`](./apps/desktop/README.md) for the full lane list and
platform-specific packaging notes.

## Expectations for a change

- **Verify on the real surface.** Desktop changes should be confirmed on the actual
  Electron app, not only via unit tests. Transcript/timeline behavior, session
  correctness, and Codex-style UX are treated as product features.
- **Keep the renderer/main/preload boundary tight.** Don't widen the renderer's Node
  access; route through the typed IPC surface.
- **Keep `pi-sdk-driver` thin.** Prefer adapting upstream `pi` behavior over forking
  or reimplementing it.
- **Make focused commits.** One logical change per commit so the diff is easy to
  review.

Repo-wide conventions live in [`AGENTS.md`](./AGENTS.md) (the root `CLAUDE.md` is a
symlink to it). Path-scoped guidance lives in nested `AGENTS.md` files.

## Pull requests

- Describe what changed and how you verified it.
- Make sure `pnpm check` and the relevant test lane pass.
- Keep unrelated changes out of the PR.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](./LICENSE).
