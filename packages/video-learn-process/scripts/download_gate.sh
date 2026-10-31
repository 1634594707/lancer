#!/usr/bin/env bash
# Legacy entry point retired: the old probe fallbacks could manufacture success.
# Use the desktop download -> media -> analysis pipeline and its verified gates.
set -euo pipefail
printf '%s\n' 'E_PROBE_FAIL: legacy download_gate.sh is disabled; use Lancer media/analysis pipeline. No files or gates changed.' >&2
exit 1
