import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'

// First 50 decimal digits of π — used as a reference for quick verification.
// Feynman Point: decimal digits 762–767 are "999999" (string indices 763–768).
const PI_REF_50 = '3.14159265358979323846264338327950288419716939937510'

function verifyPi(pi) {
  const checkLen = Math.min(pi.length, PI_REF_50.length)
  if (pi.slice(0, checkLen) !== PI_REF_50.slice(0, checkLen)) {
    return { ok: false, note: 'first 50 digits mismatch' }
  }
  if (pi.length >= 769) {
    if (pi.slice(763, 769) !== '999999') {
      return { ok: false, note: 'Feynman Point mismatch at decimal 762–767' }
    }
    return { ok: true, note: 'first 50 digits ✓  ·  Feynman Point (d762) ✓' }
  }
  return { ok: true, note: 'first 50 digits ✓' }
}

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
        setResult({ pi, ms, digits: d, verified: verifyPi(pi) })
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

          <div className={`verify-badge ${result.verified.ok ? 'verify-ok' : 'verify-fail'}`}>
            {result.verified.ok ? '✓' : '✗'} {result.verified.note}
          </div>

          <PiVirtualList pi={result.pi} />
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

const CHARS_PER_ROW = 80
const ROW_HEIGHT = 22
const MAX_CONTAINER_HEIGHT = 330
const OVERSCAN = 3

function PiVirtualList({ pi }) {
  const [scrollTop, setScrollTop] = useState(0)

  const numRows = Math.ceil(pi.length / CHARS_PER_ROW)
  const totalHeight = numRows * ROW_HEIGHT
  const containerHeight = Math.min(MAX_CONTAINER_HEIGHT, totalHeight)

  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const lastRow = Math.min(numRows, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN)

  const rows = useMemo(() => {
    const items = []
    for (let i = firstRow; i < lastRow; i++) {
      const start = i * CHARS_PER_ROW
      items.push({ i, start, text: pi.slice(start, start + CHARS_PER_ROW) })
    }
    return items
  }, [pi, firstRow, lastRow])

  return (
    <div
      className="pi-virtual"
      style={{ height: containerHeight }}
      onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: firstRow * ROW_HEIGHT, width: '100%' }}>
          {rows.map(({ i, start, text }) => (
            <div key={i} className="pi-row">
              <span className="pi-row-idx">{start}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
