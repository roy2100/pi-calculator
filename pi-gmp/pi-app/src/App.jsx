import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

export default function App() {
  const [digits, setDigits] = useState(10000)
  const [status, setStatus] = useState('loading')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const workerRef = useRef(null)
  const jobIdRef = useRef(0)
  const lastPiRef = useRef('')

  useEffect(() => {
    const worker = new Worker(import.meta.env.BASE_URL + 'worker.js')
    workerRef.current = worker

    worker.onmessage = ({ data }) => {
      const { type, pi, ms, digits: d, pct, msg } = data
      if (type === 'ready') {
        setStatus('ready')
      } else if (type === 'progress') {
        setProgress(pct)
      } else if (type === 'error') {
        console.error('Worker error:', msg)
        setStatus('error')
      } else if (type === 'done') {
        setProgress(100)
        lastPiRef.current = pi
        setResult({ pi, ms, digits: d })
        setStatus('done')
      }
    }

    return () => worker.terminate()
  }, [])

  const handleCompute = useCallback(() => {
    if (status === 'loading' || status === 'computing') return
    setStatus('computing')
    setProgress(0)
    setResult(null)
    workerRef.current.postMessage({ type: 'compute', digits, id: ++jobIdRef.current })
  }, [digits, status])

  const handleCopy = () => navigator.clipboard.writeText(lastPiRef.current)

  const terms = Math.ceil(digits / 14.18) + 10
  const isLoading = status === 'loading'
  const isComputing = status === 'computing'

  return (
    <div className="container">
      <h1>π WASM 计算器</h1>
      <p className="subtitle">
        C + GMP · Emscripten · Chudnovsky + Binary Splitting
      </p>

      <div className="controls">
        <label>位数（小数点后）</label>
        <input
          type="number"
          value={digits}
          min={10}
          max={1000000}
          step={1000}
          onChange={e => setDigits(Math.max(10, parseInt(e.target.value) || 10))}
        />
        <button onClick={handleCompute} disabled={isLoading || isComputing} className="btn-primary">
          {isLoading ? '加载中…' : isComputing ? '计算中…' : '▶ 计算'}
        </button>
        <button onClick={handleCopy} disabled={!result} className="btn-secondary">
          复制结果
        </button>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {result && (
        <>
          <div className="stats">
            <Stat label="位数" value={result.digits.toLocaleString()} />
            <Stat label="用项数" value={terms.toLocaleString()} />
            <Stat
              label="耗时"
              value={result.ms < 1000
                ? `${Math.round(result.ms)} ms`
                : `${(result.ms / 1000).toFixed(2)} s`}
            />
            <Stat
              label="速度"
              value={`${Math.round(result.digits / (result.ms / 1000)).toLocaleString()} d/s`}
            />
          </div>

          <div className="pi-output">
            {result.digits > 500
              ? `${result.pi.slice(0, 102)}\n[...省略中间...]\n${result.pi.slice(-100)}`
              : result.pi}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}
