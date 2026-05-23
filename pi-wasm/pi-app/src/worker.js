import init, { compute_pi } from '@pkg/pi_wasm.js'

let ready = false

async function setup() {
  await init()
  ready = true
  self.postMessage({ type: 'ready' })
}

setup().catch(err => self.postMessage({ type: 'error', msg: String(err) }))

self.onmessage = async ({ data }) => {
  const { type, digits, id } = data
  if (type !== 'compute') return
  if (!ready) {
    self.postMessage({ type: 'error', id, msg: 'WASM not initialized' })
    return
  }

  self.postMessage({ type: 'progress', id, pct: 5 })
  const t0 = performance.now()

  try {
    const pi = compute_pi(digits)
    const ms = performance.now() - t0
    self.postMessage({ type: 'done', id, pi, ms, digits })
  } catch (err) {
    self.postMessage({ type: 'error', id, msg: String(err) })
  }
}
