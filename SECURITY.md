# Security

Lancer is currently an unreleased Alpha. Only the current development version receives fixes; no historical release has a security-support promise.

Please do not put credentials, private conversations or exploit payloads in public issues. Before enabling public downloads, the repository owner must enable GitHub private vulnerability reporting (Security → Advisories). Report security issues there once that channel is available. Until then, request a private contact channel without posting sensitive details.

Lancer can execute local agent tools and installed extensions with the user's account permissions. Use trusted extensions and inspect actions involving credentials or external services. Model prompts, attachments and tool output may be sent to the configured provider. Doubao integration uses the locally signed accessibility helper and a fixed conversation binding.

The renderer uses context isolation and narrow preload APIs. Extension frames have a separate restrictive content policy. These boundaries do not sandbox arbitrary agent shell commands or third-party extensions.

Maintainers must run `pnpm audit:dependencies`, review dependency changes and retain real Electron verification before release. The CI gate rejects high and critical advisories across runtime and build dependencies; a clean audit is one check, not proof that all vulnerabilities are absent. Do not publish userData, `~/.pi/agent`, local signing configuration, `.lancer-task` or raw authenticated traces.

Public releases must start from a fresh source export, never the development checkout or its Git history. Both source exporters exclude runtime configuration and account state, including model/gateway settings, OAuth files, cookies, saved workspaces, conversations and local signing data. The root `.npmrc` is regenerated with only the public linker setting. Generic provider integrations and documented placeholders remain source; the maintainer's live connections are not.

Use `pnpm package:source SOURCE_EXPORT NEW_ARCHIVE.tar.gz` for either source export. It verifies the manifest, rejects extra or changed files, and removes archive usernames, groups, ownership IDs and timestamps. Scan the resulting archives for secrets and private endpoint/account values; inspect included screenshots and media separately. Do not print matched credentials in logs or publish the private comparison inputs. A secret scanner alone cannot establish that arbitrary private URLs or conversation content are absent.
