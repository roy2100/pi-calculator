#!/usr/bin/env bash
set -e

echo "=== 编译 Rust → WASM ==="
wasm-pack build --target web --release

echo "=== 检查产物大小 ==="
ls -lh pkg/*.wasm

echo "=== 启动 Vite 开发服务器 ==="
cd pi-app
npm run dev
