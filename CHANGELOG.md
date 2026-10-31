# Changelog

## Unreleased — November 1 Alpha preparation

- Upgrade the Electron runtime and patch production dependencies.
- Upgrade pnpm, Vite and electron-builder, backport vulnerable transitive build dependencies, and audit development tools in CI as well as runtime dependencies.
- Remove the old electron-builder patch after verifying its signing and Windows path fixes are included upstream.
- Preserve the current conversation layout, GitTree, light paths and running borders.
- Bound recursive parallel task creation and add a provider-reported token admission limit.
- Repair ordering when partial Doubao snapshots reveal earlier instructions.
- Read collapsed Doubao user bubbles and exclude native date labels; retain older mirrors in expandable records during migration.
- Confirm native sends against the current Doubao composer, preserving single submission and conversation/focus checks.
- Honor configured downloader and FFmpeg paths when acquiring and merging video.
- Align source setup, local signing and website release links with Lancer.
- Add environment diagnostics and a filtered source export with file hashes.
- Keep release helpers in clean source exports and derive package metadata from the fork's own repository.
- Support native OAuth video analysis when model configuration only supplies model overlays.
- Update live and native regression checks for the current conversation layout and explicit test language.
- Export a standalone Light UI package with a runnable demo and reuse prompt.

Release status and validation limits are recorded in [release readiness](docs/release-readiness.md). This entry does not announce a published release.
