#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$PROJECT_ROOT/.opencode-local"
OPENCODE_BIN="${OPENCODE_BIN:-/Users/aleckwon/.opencode/bin/opencode}"

mkdir -p "$CONFIG_DIR"

cd "$PROJECT_ROOT"

export OPENCODE_CONFIG_DIR="$CONFIG_DIR"
export OPENCODE_DISABLE_CLAUDE_CODE=1

exec "$OPENCODE_BIN" "$@"
