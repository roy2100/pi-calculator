#!/usr/bin/env bash
set -e

GMP_VERSION="6.3.0"
GMP_DIR="gmp-${GMP_VERSION}"
GMP_ARCHIVE="${GMP_DIR}.tar.xz"
GMP_INSTALL="$(pwd)/gmp-install"

# ── 检查 emcc ────────────────────────────────────────────────────────────────
if ! command -v emcc &>/dev/null; then
  echo "错误：未找到 emcc，请先激活 emsdk："
  echo "  source /path/to/emsdk/emsdk_env.sh"
  exit 1
fi
echo "=== Emscripten $(emcc --version | head -1) ==="

# ── 下载 GMP ─────────────────────────────────────────────────────────────────
if [ ! -f "$GMP_ARCHIVE" ]; then
  echo "=== 下载 GMP ${GMP_VERSION} ==="
  curl -LO "https://gmplib.org/download/gmp/${GMP_ARCHIVE}"
fi

if [ ! -d "$GMP_DIR" ]; then
  echo "=== 解压 GMP ==="
  tar xf "$GMP_ARCHIVE"
fi

# ── 编译 GMP → WASM ──────────────────────────────────────────────────────────
if [ ! -f "$GMP_INSTALL/lib/libgmp.a" ]; then
  echo "=== 编译 GMP（--disable-assembly，纯 C 模式）==="
  cd "$GMP_DIR"

  emconfigure ./configure \
    --disable-assembly \
    --host=none \
    --prefix="$GMP_INSTALL" \
    --disable-shared \
    --enable-static \
    --with-pic

  NPROC=$(nproc 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null || echo 4)
  emmake make -j"$NPROC"
  emmake make install
  cd ..
  echo "=== GMP 编译完成，安装到 ${GMP_INSTALL} ==="
else
  echo "=== GMP 已编译，跳过（删除 gmp-install/ 可重新编译）==="
fi

# ── 编译 pi_gmp.c → WASM ─────────────────────────────────────────────────────
mkdir -p www
echo "=== 编译 pi_gmp.c ==="

emcc pi_gmp.c \
  -I "${GMP_INSTALL}/include" \
  "${GMP_INSTALL}/lib/libgmp.a" \
  -O3 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='createPiModule' \
  -s EXPORTED_FUNCTIONS='["_compute_pi","_free_string"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","UTF8ToString"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=67108864 \
  -s MAXIMUM_MEMORY=2147483648 \
  -s STACK_SIZE=5242880 \
  -o www/pi_gmp.js

echo ""
echo "=== Build output ==="
ls -lh www/pi_gmp.js www/pi_gmp.wasm

echo ""
echo "=== Run the frontend ==="
echo "  cd pi-app && npm install && npm run dev"
