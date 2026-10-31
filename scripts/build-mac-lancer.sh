#!/usr/bin/env bash
# Build a persistently signed, non-notarized Lancer.app + .dmg for Apple Silicon.
#
# Usage:
#   bash scripts/build-mac-lancer.sh            # install deps, build, package, verify
#   bash scripts/build-mac-lancer.sh --skip-install
#   bash scripts/build-mac-lancer.sh --dir      # only Lancer.app (no dmg/zip), fastest
#   bash scripts/build-mac-lancer.sh --install  # also copy Lancer.app into /Applications
#
# Requirements: macOS on Apple Silicon, Node.js >= 22.19.0 < 26, Xcode Command Line Tools
# (xcode-select --install). A persistent signing identity must be configured.
set -euo pipefail

PNPM_VERSION="10.34.9"
SKIP_INSTALL=0
DIR_ONLY=0
INSTALL_APP=0

for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    --dir) DIR_ONLY=1 ;;
    --install) INSTALL_APP=1 ;;
    -h | --help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
desktop_dir="$repo_root/apps/desktop"
release_dir="$desktop_dir/release-local-$(date +%Y%m%d-%H%M%S)-$$"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

step "Checking the build machine"
[[ "$(uname -s)" == "Darwin" ]] || fail "This script builds the macOS app and must run on macOS."
if [[ "$(uname -m)" != "arm64" ]]; then
  fail "Lancer targets Apple Silicon (arm64). Run this on an M-series Mac (not under Rosetta)."
fi
command -v node >/dev/null 2>&1 || fail "Node.js is not installed (need >= 22)."
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major >= 22 && major < 26 && (major !== 22 || minor >= 19) ? 0 : 1)' || fail "Lancer requires Node.js >=22.19.0 <26 (24 recommended)."
if ! xcode-select -p >/dev/null 2>&1; then
  fail "Xcode Command Line Tools are missing. Run: xcode-select --install"
fi
command -v xcrun >/dev/null 2>&1 || fail "xcrun not found; reinstall Xcode Command Line Tools."
echo "macOS $(sw_vers -productVersion) $(uname -m), Node $(node -v)"

step "Resolving pnpm $PNPM_VERSION"
if command -v corepack >/dev/null 2>&1 && corepack pnpm@"$PNPM_VERSION" --version >/dev/null 2>&1; then
  pnpm_cmd=(corepack pnpm@"$PNPM_VERSION")
elif command -v pnpm >/dev/null 2>&1 && [[ "$(pnpm --version)" == "$PNPM_VERSION" ]]; then
  pnpm_cmd=(pnpm)
else
  pnpm_cmd=(npx --yes pnpm@"$PNPM_VERSION")
fi
echo "Using: ${pnpm_cmd[*]} ($("${pnpm_cmd[@]}" --version))"
# electron-builder shells out to a bare `pnpm` to collect production dependencies,
# so make sure one resolves on PATH even when pnpm only exists through corepack/npx.
shim_dir="$(mktemp -d)"
# Retain the build shim alongside other build evidence.
printf '#!/usr/bin/env bash\nexec %s "$@"\n' "$(printf '%q ' "${pnpm_cmd[@]}")" >"$shim_dir/pnpm"
chmod +x "$shim_dir/pnpm"
export PATH="$shim_dir:$PATH"
pnpm() { "${pnpm_cmd[@]}" "$@"; }

cd "$repo_root"

if ((SKIP_INSTALL == 0)); then
  step "Installing dependencies"
  pnpm install --frozen-lockfile
fi

step "Building Lancer (shared packages, native helper, renderer and main)"
pnpm --filter @lancer/desktop run build

step "Packaging with a pinned signing identity (no notarization)"
targets=(--mac --arm64)
if ((DIR_ONLY == 1)); then
  targets+=(--dir)
fi
(
  cd "$desktop_dir"
  # Never pick up a random keychain identity or try to notarize: Lancer is persistently signed.
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  unset CSC_LINK CSC_KEY_PASSWORD APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID \
    APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER
  node scripts/run-electron-builder.mjs "${targets[@]}" --publish never "-c.directories.output=$release_dir"
)

app_path="$release_dir/mac-arm64/Lancer.app"
[[ -d "$app_path" ]] || fail "Expected $app_path was not produced."

step "Verifying the persistent signature"
codesign --verify --deep --strict --verbose=2 "$app_path"
codesign -dv "$app_path" 2>&1 | grep -E "^(Identifier|Signature|TeamIdentifier)=" || true
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Contents/Info.plist"

if ((INSTALL_APP == 1)); then
  step "Installing into /Applications"
  node "$desktop_dir/scripts/install-mac-app.mjs" "$app_path"
fi

step "Done"
echo "App: $app_path"
if ((DIR_ONLY == 0)); then
  find "$release_dir" -maxdepth 1 \( -name 'Lancer-*.dmg' -o -name 'Lancer-*.zip' \) -print
fi
