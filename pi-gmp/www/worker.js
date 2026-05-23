/* Emscripten 经 MODULARIZE=1 输出 createPiModule()，用 importScripts 加载 */
importScripts('./pi_gmp.js');

let Module = null;

async function ensureInit() {
  if (Module) return;
  Module = await createPiModule();
}

(async () => {
  await ensureInit();
  postMessage({ type: 'ready' });
})();

self.onmessage = async (e) => {
  const { type, digits, id } = e.data;
  if (type === 'init') return;

  if (type === 'compute') {
    await ensureInit();
    postMessage({ type: 'progress', id, pct: 5 });

    const t0 = performance.now();
    let pi;
    try {
      /* C 函数返回 char*，读完后必须 free_string 释放 */
      const ptr = Module.ccall('compute_pi', 'number', ['number'], [digits]);
      pi = Module.UTF8ToString(ptr);
      Module.ccall('free_string', null, ['number'], [ptr]);
    } catch (err) {
      postMessage({ type: 'error', id, msg: err.message });
      return;
    }
    const ms = performance.now() - t0;
    postMessage({ type: 'done', id, pi, ms, digits });
  }
};
