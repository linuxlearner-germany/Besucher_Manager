#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

find "$ROOT_DIR/node_modules/.bin" -type f -exec chmod +x {} \; 2>/dev/null || true
find "$ROOT_DIR/node_modules" -path '*/@esbuild/*/bin/esbuild' -type f -exec chmod +x {} \; 2>/dev/null || true
chmod +x "$ROOT_DIR/node_modules/@esbuild/linux-x64/bin/esbuild" 2>/dev/null || true
chmod +x "$ROOT_DIR/node_modules/.bin/esbuild" 2>/dev/null || true
chmod +x "$ROOT_DIR/node_modules/vite/bin/vite.js" 2>/dev/null || true
