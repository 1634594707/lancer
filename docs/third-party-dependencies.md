# Third-party dependencies

Lancer's source license does not replace the licenses of its dependencies or assets.
The lockfile pins the dependency versions used for this source release.

- `apps/desktop` is the desktop application. Its installed production dependency inventory can be inspected with `pnpm --filter @lancer/desktop licenses list --prod --long`.
- `packages/light-ui` has no runtime dependencies. Its source uses MIT; TypeScript is a development tool.
- `video` contains the optional upstream promotional-video project. It uses **Remotion License**, not MIT. Read the installed `node_modules/remotion/LICENSE.md` before using those tools. This directory is not part of the desktop runtime or Light UI package.
- The website and video tooling include other dependencies with LGPL, MPL and font licenses. `pnpm licenses list --prod --long` lists all workspace production dependencies; it is a broader inventory than the desktop app.
- Desktop font license texts are retained in `apps/desktop/src/styles/fonts/Inter-LICENSE.txt` and `JetBrains-Mono-LICENSE.txt`. App artwork provenance is recorded in `apps/desktop/resources/brand/README.md`.

For redistribution of a built application, retain the licenses included by Electron and its bundled dependencies. A source-only release does not include `node_modules`, private videos, user portraits, credentials or conversation histories. Review dependency license changes when updating the lockfile; an automated license list is an inventory, not a substitute for reading the applicable terms.
