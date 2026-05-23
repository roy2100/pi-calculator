# Pi WASM 计算器 — Claude Code 执行计划

## 前置说明：关于 GMP 和 WASM

**GMP 无法直接编译到 WASM**。原因是 GMP 大量使用平台相关汇编（x86/ARM intrinsics），
Emscripten 无法翻译这些指令。实际可行方案：

| 方案 | 性能 | WASM 兼容 | 推荐度 |
|---|---|---|---|
| Rust + `num-bigint` | 中（纯 Rust） | ✅ | ★★★ |
| Rust + `dashu` | 高（SIMD 优化） | ✅ | ★★★★★ |
| C + `libtommath` via Emscripten | 中 | ✅ | ★★★ |
| C + GMP via Emscripten | — | ❌ 汇编不兼容 | 不可行 |

**本计划采用 Rust + `dashu` + `wasm-pack`**，这是目前在纯 WASM
环境下最接近 GMP 性能的方案，百万位计算可比 JS BigInt 快 20-50 倍。

---

## 目标

构建一个网页 π 计算器：
- 后端：Rust 实现 Chudnovsky + Binary Splitting，编译为 WASM
- 前端：原生 HTML/JS，Web Worker 中运行 WASM（不阻塞主线程）
- 支持范围：10 位 ～ 1,000,000 位（百万位）
- 进度反馈：计算过程中实时回报完成百分比

---

## 项目结构

```
pi-wasm/
├── Cargo.toml
├── src/
│   └── lib.rs          # Rust: Chudnovsky + binary splitting
├── www/
│   ├── index.html      # 前端页面
│   ├── worker.js       # Web Worker：加载 WASM 并调度计算
│   └── app.js          # 主线程逻辑
├── pkg/                # wasm-pack 输出（自动生成，不要手动编辑）
└── build.sh            # 一键构建脚本
```

---

## Step 1：环境准备

```bash
# 安装 Rust（若未安装）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# 添加 WASM 编译目标
rustup target add wasm32-unknown-unknown

# 安装 wasm-pack（自动处理 wasm-bindgen + 打包）
cargo install wasm-pack

# 验证
wasm-pack --version   # 应输出 wasm-pack x.y.z
```

---

## Step 2：Cargo.toml

```toml
[package]
name = "pi-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]    # 编译为动态库供 WASM 使用

[dependencies]
wasm-bindgen = "0.2"
dashu = { version = "0.4", default-features = false, features = ["integer"] }
serde = { version = "1", features = ["derive"] }
serde-wasm-bindgen = "0.6"
js-sys = "0.3"

[profile.release]
opt-level = 3
lto = true             # 链接时优化，减小体积
codegen-units = 1

[package.metadata.wasm-pack.profile.release]
wasm-opt = ["-O4"]     # wasm-opt 额外优化
```

---

## Step 3：src/lib.rs — 核心算法

```rust
use wasm_bindgen::prelude::*;
use dashu::integer::IBig;

// Binary splitting 返回的三元组
struct BSResult {
    p: IBig,
    q: IBig,
    t: IBig,
}

fn binary_split(a: u64, b: u64) -> BSResult {
    if b - a == 1 {
        let k = IBig::from(a);
        let (p, q) = if a == 0 {
            (IBig::from(1), IBig::from(1))
        } else {
            let p = -(IBig::from(6)*&k - 5)
                  * (IBig::from(2)*&k - 1)
                  * (IBig::from(6)*&k - 1);
            let q = IBig::from(10939058860032000u64) * &k * &k * &k;
            (p, q)
        };
        let t = &p * (IBig::from(13591409) + IBig::from(545140134) * &k);
        return BSResult { p, q, t };
    }

    let m = (a + b) / 2;
    let l = binary_split(a, m);
    let r = binary_split(m, b);

    BSResult {
        p: &l.p * &r.p,
        q: &l.q * &r.q,
        t: &r.q * &l.t + &l.p * &r.t,
    }
}

// 整数平方根（Newton 法）
fn isqrt(n: &IBig) -> IBig {
    if *n == IBig::ZERO { return IBig::ZERO; }
    let bits = n.bit_len();
    let mut x = IBig::ONE << ((bits + 1) / 2);
    loop {
        let x1 = (&x + n / &x) >> 1;
        if x1 >= x { return x; }
        x = x1;
    }
}

#[wasm_bindgen]
pub fn compute_pi(digits: u32) -> String {
    let digits = digits as u64;
    // 每项贡献 14.18 位，多算 10 项保证精度
    let terms = (digits as f64 / 14.18).ceil() as u64 + 10;

    let bs = binary_split(0, terms);

    // π = 426880 * sqrt(10005) * Q / T
    // 整数化：one = 10^(digits+20)，算 isqrt(10005 * Q^2 * one^2)
    let extra = digits + 20;
    let one = IBig::from(10).pow(extra as usize);
    let radicand = IBig::from(10005u32) * &bs.q * &bs.q * &one * &one;
    let sqrt_part = isqrt(&radicand);
    let pi_int = IBig::from(426880u32) * sqrt_part / &bs.t;

    // 转成字符串并插入小数点
    let s = pi_int.to_string();
    if s.len() <= 1 {
        return "3.".to_string();
    }
    format!("{}.{}", &s[0..1], &s[1..digits as usize + 1])
}

// 带进度回调的版本（分段计算，每段后回调）
#[wasm_bindgen]
pub fn compute_pi_chunked(digits: u32, progress_cb: &js_sys::Function) -> String {
    // 简化实现：在 binary_split 前后各回调一次
    // 生产版本可在递归各层插入更细粒度回调
    let _ = progress_cb.call1(&JsValue::NULL, &JsValue::from(10.0));
    let result = compute_pi(digits);
    let _ = progress_cb.call1(&JsValue::NULL, &JsValue::from(100.0));
    result
}
```

> **注意**：对于真正的进度回调，需要在 `binary_split` 递归时传入深度参数，
> 在达到特定层级时通过 `js_sys::Function` 回调 JS 侧。
> 简单实现先用计算前/后两次回调，后续可细化。

---

## Step 4：www/worker.js — Web Worker

```javascript
// Web Worker：在独立线程中加载和运行 WASM

let wasmModule = null;

// 初始化：加载 WASM 模块
async function init() {
  const { default: init, compute_pi } = await import('../pkg/pi_wasm.js');
  await init();
  wasmModule = { compute_pi };
  postMessage({ type: 'ready' });
}

// 监听主线程消息
self.onmessage = async (e) => {
  const { type, digits, id } = e.data;

  if (type === 'init') {
    await init();
    return;
  }

  if (type === 'compute') {
    if (!wasmModule) {
      postMessage({ type: 'error', id, msg: 'WASM not initialized' });
      return;
    }

    postMessage({ type: 'progress', id, pct: 5 });

    const t0 = performance.now();
    let pi;
    try {
      pi = wasmModule.compute_pi(digits);
    } catch (err) {
      postMessage({ type: 'error', id, msg: err.message });
      return;
    }
    const ms = performance.now() - t0;

    postMessage({ type: 'done', id, pi, ms, digits });
  }
};
```

---

## Step 5：www/index.html — 前端页面

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>π WASM 计算器</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.4rem; font-weight: 500; }
    .controls { display: flex; gap: 12px; align-items: center; margin: 1.5rem 0; flex-wrap: wrap; }
    input[type=number] { width: 130px; padding: 6px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
    button { padding: 6px 18px; border-radius: 6px; border: 1px solid #888; cursor: pointer; font-size: 14px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 1rem 0; }
    .stat { background: #f5f5f5; border-radius: 6px; padding: 10px; }
    .stat-label { font-size: 11px; color: #666; }
    .stat-val { font-size: 18px; font-weight: 500; }
    .progress-bar { height: 4px; background: #eee; border-radius: 2px; margin: 8px 0; overflow: hidden; }
    .progress-fill { height: 100%; background: #555; transition: width 0.2s; width: 0%; }
    #pi-out { font-family: monospace; font-size: 13px; line-height: 1.8; word-break: break-all;
              background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 1rem;
              max-height: 320px; overflow-y: auto; margin-top: 1rem; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>π WASM 计算器</h1>
  <p style="color:#666;font-size:13px">Rust + dashu + wasm-pack · Chudnovsky + Binary Splitting</p>

  <div class="controls">
    <label style="font-size:13px">位数（小数点后）</label>
    <input type="number" id="digits" value="10000" min="10" max="1000000" step="1000">
    <button id="btn">▶ 计算</button>
    <button id="copy-btn" disabled>复制结果</button>
  </div>

  <div class="progress-bar"><div class="progress-fill" id="prog"></div></div>

  <div class="stats" id="stats" style="display:none">
    <div class="stat"><div class="stat-label">位数</div><div class="stat-val" id="s-digits">—</div></div>
    <div class="stat"><div class="stat-label">用项数</div><div class="stat-val" id="s-terms">—</div></div>
    <div class="stat"><div class="stat-label">耗时</div><div class="stat-val" id="s-time">—</div></div>
    <div class="stat"><div class="stat-label">速度</div><div class="stat-val" id="s-speed">—</div></div>
  </div>

  <div id="pi-out" style="display:none"></div>

  <script src="app.js"></script>
</body>
</html>
```

---

## Step 6：www/app.js — 主线程逻辑

```javascript
const worker = new Worker('./worker.js', { type: 'module' });
let jobId = 0;
let lastPi = '';

worker.postMessage({ type: 'init' });

worker.onmessage = (e) => {
  const { type, id, pi, ms, digits, pct, msg } = e.data;
  if (type === 'ready') { console.log('WASM ready'); return; }
  if (type === 'progress') { document.getElementById('prog').style.width = pct + '%'; return; }
  if (type === 'error') { alert('计算错误: ' + msg); resetBtn(); return; }
  if (type === 'done') {
    document.getElementById('prog').style.width = '100%';
    lastPi = pi;
    showResult(pi, ms, digits);
    resetBtn();
  }
};

function resetBtn() {
  document.getElementById('btn').disabled = false;
  document.getElementById('btn').textContent = '▶ 计算';
}

document.getElementById('btn').addEventListener('click', () => {
  const digits = parseInt(document.getElementById('digits').value);
  if (isNaN(digits) || digits < 10) return;
  document.getElementById('btn').disabled = true;
  document.getElementById('btn').textContent = '计算中…';
  document.getElementById('prog').style.width = '0%';
  document.getElementById('stats').style.display = 'none';
  document.getElementById('pi-out').style.display = 'none';
  document.getElementById('copy-btn').disabled = true;
  worker.postMessage({ type: 'compute', digits, id: ++jobId });
});

document.getElementById('copy-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(lastPi);
});

function showResult(pi, ms, digits) {
  const terms = Math.ceil(digits / 14.18) + 10;
  document.getElementById('s-digits').textContent = digits.toLocaleString();
  document.getElementById('s-terms').textContent = terms.toLocaleString();
  document.getElementById('s-time').textContent = ms < 1000 ? Math.round(ms) + ' ms' : (ms/1000).toFixed(2) + ' s';
  document.getElementById('s-speed').textContent = Math.round(digits / (ms / 1000)).toLocaleString() + ' d/s';
  document.getElementById('stats').style.display = 'grid';

  // 超过 500 位只显示前后各 100 位
  const display = digits > 500
    ? pi.slice(0, 102) + '\n[...省略中间...]\n' + pi.slice(-100)
    : pi;
  const out = document.getElementById('pi-out');
  out.textContent = display;
  out.style.display = 'block';
  document.getElementById('copy-btn').disabled = false;
}
```

---

## Step 7：build.sh — 构建脚本

```bash
#!/usr/bin/env bash
set -e

echo "=== 编译 Rust → WASM ==="
wasm-pack build --target web --release
# 输出到 pkg/ 目录

echo "=== 检查产物大小 ==="
ls -lh pkg/*.wasm

echo "=== 启动本地开发服务器 ==="
# 注意：必须用 HTTP 服务器，不能直接打开 HTML 文件（WASM 需要正确 MIME）
# 选项 A：Python
python3 -m http.server 8080 --directory www
# 选项 B：Node（需 npx serve）
# npx serve www -p 8080
```

---

## 构建与运行命令（给 Claude Code 执行）

```bash
# 1. 建立项目目录
mkdir pi-wasm && cd pi-wasm

# 2. 初始化 Cargo 项目
cargo init --lib

# 3. 写入上述所有文件（Cargo.toml / src/lib.rs / www/）

# 4. 一键构建
wasm-pack build --target web --release

# 5. 启动服务器
cd www && python3 -m http.server 8080

# 6. 打开浏览器访问
open http://localhost:8080
```

---

## 性能预期（Apple M2 参考，不同机器有差异）

| 位数 | JS BigInt | Rust WASM (dashu) | 提速倍数 |
|------|-----------|-------------------|---------|
| 10,000 | ~80 ms | ~8 ms | ~10x |
| 100,000 | ~12 s | ~0.4 s | ~30x |
| 1,000,000 | ~40 min | ~60 s | ~40x |

---

## 后续优化方向

1. **SharedArrayBuffer + Atomics**：开启多线程 WASM（需服务器设置 COOP/COEP 响应头）
2. **分段输出**：超过 100 万位时边算边输出到页面，不等全部完成
3. **持久化**：`IndexedDB` 缓存已算结果，避免重复计算
4. **wasm-opt**：已在 `Cargo.toml` 中启用 `-O4`，进一步可用 Binaryen 手动优化

---

## 关键依赖版本锁定

```toml
# Cargo.lock 会自动生成，确保以下版本可用：
# dashu 0.4.x  — 纯 Rust 任意精度，支持 wasm32-unknown-unknown
# wasm-bindgen 0.2.x  — Rust ↔ JS 互操作
# wasm-pack 0.12.x  — 构建工具链
```

> `rug`（GMP 的 Rust 绑定）**不在依赖列表中**，它无法编译到 WASM。
> `dashu` 的大整数乘法采用 Karatsuba 和 Toom-Cook 算法，
> 在 WASM 环境中已是最优选择。
