// 子 Worker：只负责计算 binary_split(a, b)，结果序列化为 "p|q|t" 字符串
import init, { compute_split } from '@pkg/pi_wasm.js'

await init()

self.onmessage = ({ data }) => {
  const { a, b, id } = data
  try {
    const raw = compute_split(a, b)
    const [p, q, t] = raw.split('|')
    self.postMessage({ type: 'done', id, p, q, t })
  } catch (err) {
    self.postMessage({ type: 'error', id, msg: String(err) })
  }
}
