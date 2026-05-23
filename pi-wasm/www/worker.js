let wasmModule = null;

async function init() {
  const { default: init, compute_pi } = await import('../pkg/pi_wasm.js');
  await init();
  wasmModule = { compute_pi };
  postMessage({ type: 'ready' });
}

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
