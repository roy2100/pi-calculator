// 主 Worker：协调两个子 Worker 并行计算 binary_split 左右两半，再合并输出 π
import init, { compute_pi, compute_pi_from_halves } from '@pkg/pi_wasm.js'

// 并行化阈值：位数较少时直接单线程计算，避免 Worker 创建开销
const PARALLEL_THRESHOLD = 5000

let ready = false
const numWorkers = Math.max(2, Math.min(navigator.hardwareConcurrency, 8))

async function setup() {
  await init()
  ready = true
  self.postMessage({ type: 'ready', threads: numWorkers })
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
    let pi
    if (digits < PARALLEL_THRESHOLD) {
      // 小位数：直接单线程计算
      pi = compute_pi(digits)
    } else {
      // 大位数：两个子 Worker 并行算左右半区
      const terms = Math.ceil(digits / 14.18) + 10
      const mid = Math.floor(terms / 2)

      const [left, right] = await Promise.all([
        runSplit(0, mid),
        runSplit(mid, terms),
      ])

      self.postMessage({ type: 'progress', id, pct: 75 })

      // 主 WASM 实例合并结果并完成计算
      pi = compute_pi_from_halves(
        digits,
        left.p, left.q, left.t,
        right.p, right.q, right.t,
      )
    }

    const ms = performance.now() - t0
    self.postMessage({ type: 'done', id, pi, ms, digits })
  } catch (err) {
    self.postMessage({ type: 'error', id, msg: String(err) })
  }
}

function runSplit(a, b) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./split_worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      worker.terminate()
      if (data.type === 'done') resolve(data)
      else reject(new Error(data.msg))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message))
    }
    worker.postMessage({ a, b, id: `${a}-${b}` })
  })
}
