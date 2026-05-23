#!/usr/bin/env bash
set -e

echo "=== 编译 Rust → WASM ==="
wasm-pack build --target web --release

echo "=== 检查产物大小 ==="
ls -lh pkg/*.wasm

echo "=== 启动本地开发服务器 ==="
python3 -m http.server 8080 --directory www
