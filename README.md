# π Calculator

[![License: LGPL v3](https://img.shields.io/badge/License-LGPL_v3-blue.svg)](LICENSE)

A high-performance π calculator running entirely in the browser via WebAssembly.

**[Live Demo](https://nanlei.github.io/pi-calculator/)**

## How it works

The calculator uses the **Chudnovsky algorithm** with **Binary Splitting** to compute π to up to 1,000,000 decimal places.

The core is written in C using [GMP](https://gmplib.org/) (GNU Multiple Precision Arithmetic Library) and compiled to WebAssembly with [Emscripten](https://emscripten.org/). Computation runs in a Web Worker so the UI stays responsive.

### Algorithm

The Chudnovsky series converges at ~14.18 decimal digits per term:

$$\frac{1}{\pi} = \frac{1}{426880\sqrt{10005}} \sum_{k=0}^{\infty} \frac{(-1)^k (6k)!\,(13591409 + 545140134k)}{(3k)!\,(k!)^3\,640320^{3k}}$$

Binary Splitting evaluates the partial sum as a single rational number P/Q using a divide-and-conquer tree, enabling GMP to apply its fast multiplication algorithms (Toom-Cook, Schönhage–Strassen) on large operands.

### Performance

| Digits | Time (browser, M2 Mac) |
|-------:|------------------------|
| 10,000 | ~80 ms |
| 100,000 | ~1.5 s |
| 1,000,000 | ~5 s |

## Project structure

```
pi-gmp/
  pi_gmp.c        # Chudnovsky + Binary Splitting in C (GMP)
  build.sh        # Builds GMP and compiles to WASM via Emscripten
  www/            # Static build output (pi_gmp.js, pi_gmp.wasm, worker.js)
  pi-app/         # Vite + React frontend
```

## Local development

### Prerequisites

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (activate with `source emsdk_env.sh`)
- Node.js 18+

### Build WASM

```bash
cd pi-gmp
./build.sh   # builds GMP from source, then compiles pi_gmp.c → www/
```

### Run the frontend

```bash
cd pi-gmp/pi-app
npm install
npm run dev
```

### Production build

```bash
cd pi-gmp/pi-app
npm run build   # output in dist/
```

## License

This project is licensed under the [GNU Lesser General Public License v3.0](LICENSE).

The compiled WebAssembly binary incorporates [GMP](https://gmplib.org/) (GNU Multiple Precision Arithmetic Library), which is also licensed under LGPL v3. The build scripts in this repository allow you to recompile the WASM from source with a modified version of GMP, as required by the LGPL.

## Deployment

GitHub Actions automatically builds and deploys to GitHub Pages on every push to `main`. The workflow:

1. Sets up Emscripten (with caching)
2. Compiles GMP to WASM (cached by GMP version)
3. Compiles `pi_gmp.c` → `www/pi_gmp.js` + `pi_gmp.wasm`
4. Builds the React frontend
5. Deploys to GitHub Pages
