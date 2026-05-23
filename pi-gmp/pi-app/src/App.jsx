import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'

const PI_REF_50 = '3.14159265358979323846264338327950288419716939937510'

function verifyPi(pi) {
  const checkLen = Math.min(pi.length, PI_REF_50.length)
  if (pi.slice(0, checkLen) !== PI_REF_50.slice(0, checkLen)) {
    return { ok: false }
  }
  if (pi.length >= 769) {
    return pi.slice(763, 769) === '999999' ? { ok: true } : { ok: false }
  }
  return { ok: true }
}

// Search for a digit sequence in the decimal part of pi (after "3.")
// Returns { found, pos, startIdx, length } where pos is 1-indexed decimal position
function searchInPi(pi, query) {
  if (!query) return null
  const decStr = pi.slice(2) // strip "3."
  const decIdx = decStr.indexOf(query)
  if (decIdx === -1) return { found: false }
  return { found: true, pos: decIdx + 1, startIdx: decIdx + 2, length: query.length }
}

export default function App() {
  const [digits, setDigits] = useState(10000)
  const [status, setStatus] = useState('loading')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [showExplainer, setShowExplainer] = useState(false)
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
        setSearchResult(null)
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
    setSearchResult(null)
    workerRef.current.postMessage({ type: 'compute', digits, id: ++jobIdRef.current })
  }, [digits, status])

  const handleCopy = () => navigator.clipboard.writeText(lastPiRef.current)

  const handleSearch = useCallback(() => {
    if (!result || !searchQuery) return
    setSearchResult(searchInPi(result.pi, searchQuery))
  }, [result, searchQuery])

  const isLoading = status === 'loading'
  const isComputing = status === 'computing'

  return (
    <div className="app">
      <div className="header">
        <div className="header-icon">π</div>
        <div className="header-text">
          <h1>Pi Calculator</h1>
          <p className="subtitle">High-precision π computation</p>
        </div>
        <a
          className="github-link"
          href="https://github.com/roy2100/pi-calculator"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View on GitHub"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
              0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
              -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
              .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
              -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
              .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
              .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
              0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
      </div>

      <div className="card controls-card">
        <div className="controls">
          <div className="input-group">
            <label className="input-label">Decimal digits</label>
            <input
              type="number"
              value={digits}
              min={10}
              max={1000000}
              step={1000}
              onChange={e => setDigits(Math.max(10, parseInt(e.target.value) || 10))}
            />
          </div>
          <div className="button-group">
            <button onClick={handleCompute} disabled={isLoading || isComputing} className="btn-accent">
              {isLoading ? 'Initializing…' : isComputing ? 'Computing…' : 'Compute'}
            </button>
            <button onClick={handleCopy} disabled={!result} className="btn-subtle">
              Copy all
            </button>
          </div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {result && (
        <>
          <div className="stats-row">
            <StatCard label="Digits" value={result.digits.toLocaleString()} />
            <StatCard
              label="Time"
              value={result.ms < 1000
                ? `${Math.round(result.ms)} ms`
                : `${(result.ms / 1000).toFixed(2)} s`}
            />
            <StatCard
              label="Speed"
              value={Math.round(result.digits / (result.ms / 1000)).toLocaleString()}
              unit="d/s"
            />
          </div>

          <div className="result-card">
            <div className="result-header">
              <div className={`verify-status ${result.verified.ok ? 'ok' : 'fail'}`}>
                <span className="verify-dot" />
                {result.verified.ok ? 'Verified' : 'Verification failed'}
              </div>
              <button className="info-btn" onClick={() => setShowExplainer(true)} aria-label="About π normality">
                Can every sequence be found in π?
              </button>
            </div>

            {showExplainer && (
              <div className="modal-backdrop" onClick={() => setShowExplainer(false)}>
                <div className="modal-panel" onClick={e => e.stopPropagation()}>
                  <button className="modal-close" onClick={() => setShowExplainer(false)} aria-label="Close">
                    <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
                      <path d="M2.293 2.293a1 1 0 011.414 0L8 6.586l4.293-4.293a1 1 0 111.414 1.414L9.414 8l4.293 4.293a1 1 0 01-1.414 1.414L8 9.414l-4.293 4.293a1 1 0 01-1.414-1.414L6.586 8 2.293 3.707a1 1 0 010-1.414z"/>
                    </svg>
                  </button>
                  <NormalityExplainer />
                </div>
              </div>
            )}

            <div className="search-bar">
              <input
                className="search-input"
                type="text"
                inputMode="numeric"
                placeholder="Search a sequence, e.g. your birthday"
                value={searchQuery}
                maxLength={20}
                onChange={e => {
                  setSearchQuery(e.target.value.replace(/[^0-9]/g, ''))
                  setSearchResult(null)
                }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
              <button
                className="btn-find"
                onClick={handleSearch}
                disabled={!searchQuery}
              >
                Find
              </button>
              {searchResult && (
                searchResult.found
                  ? <span className="search-msg found">
                      Found at decimal position {searchResult.pos.toLocaleString()}
                    </span>
                  : <span className="search-msg not-found">
                      Not found in {result.digits.toLocaleString()} digits
                    </span>
              )}
            </div>

            <PiVirtualList pi={result.pi} highlight={searchResult?.found ? searchResult : null} />
          </div>
        </>
      )}
    </div>
  )
}

const NORMALITY_ROWS = [
  { len: 4,  example: null,        pos: '~10,000' },
  { len: 6,  example: null,        pos: '~1,000,000' },
  { len: 8,  example: 'birthday',  pos: '~100,000,000' },
  { len: 10, example: null,        pos: '~10,000,000,000' },
]

function NormalityExplainer() {
  return (
    <div className="explainer-card">
      <div className="explainer-header">
        <span className="explainer-title">Can every sequence be found in π?</span>
        <span className="explainer-tag">Open problem</span>
      </div>

      <p className="explainer-body">
        Only if π is a <strong>normal number</strong> — meaning every finite digit sequence
        appears infinitely often with equal frequency. This is widely believed but{' '}
        <strong>has never been proven</strong>. The fact that π is irrational and transcendental
        (both proven) does not imply normality; there exist transcendental numbers that are not normal.
      </p>

      <div className="explainer-facts">
        <div className="fact-row">
          <span className="fact-label">Irrational</span>
          <span className="fact-badge proven">Proven — Lambert, 1761</span>
        </div>
        <div className="fact-row">
          <span className="fact-label">Transcendental</span>
          <span className="fact-badge proven">Proven — Lindemann, 1882</span>
        </div>
        <div className="fact-row">
          <span className="fact-label">Normal</span>
          <span className="fact-badge unproven">Unproven — open conjecture</span>
        </div>
      </div>

      <p className="explainer-subhead">Expected first occurrence (assuming uniform digit distribution)</p>
      <table className="explainer-table">
        <thead>
          <tr>
            <th>Sequence length</th>
            <th>Expected first position</th>
          </tr>
        </thead>
        <tbody>
          {NORMALITY_ROWS.map(({ len, example, pos }) => (
            <tr key={len}>
              <td>{len} digits{example && <span className="table-note"> — e.g. {example}</span>}</td>
              <td>{pos}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="explainer-footnote">
        These are probabilistic expectations (10<sup>n</sup> digits for an n-digit sequence),
        assuming π's digits behave like independent uniform random variables — consistent
        with all numerical evidence so far.
      </p>
    </div>
  )
}

function StatCard({ label, value, unit }) {
  return (
    <div className="stat-card">
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

const CHARS_PER_ROW = 70
const ROW_HEIGHT = 24
const MAX_CONTAINER_HEIGHT = 360
const OVERSCAN = 3

function PiVirtualList({ pi, highlight }) {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef(null)

  const numRows = Math.ceil(pi.length / CHARS_PER_ROW)
  const totalHeight = numRows * ROW_HEIGHT
  const containerHeight = Math.min(MAX_CONTAINER_HEIGHT, totalHeight)

  // Scroll to highlighted row when highlight changes
  useEffect(() => {
    if (!highlight || !containerRef.current) return
    const row = Math.floor(highlight.startIdx / CHARS_PER_ROW)
    const targetTop = Math.max(0, (row - 2) * ROW_HEIGHT)
    containerRef.current.scrollTop = targetTop
  }, [highlight])

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
      ref={containerRef}
      className="pi-virtual"
      style={{ height: containerHeight }}
      onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: firstRow * ROW_HEIGHT, width: '100%' }}>
          {rows.map(({ i, start, text }) => (
            <div key={i} className="pi-row">
              <span className="pi-row-idx">{start || ''}</span>
              <RowText text={text} rowStart={start} highlight={highlight} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function RowText({ text, rowStart, highlight }) {
  if (!highlight) return <span className="pi-text">{text}</span>
  const { startIdx, length } = highlight
  const rowEnd = rowStart + text.length
  if (startIdx >= rowEnd || startIdx + length <= rowStart) {
    return <span className="pi-text">{text}</span>
  }
  const hlStart = Math.max(0, startIdx - rowStart)
  const hlEnd = Math.min(text.length, startIdx + length - rowStart)
  return (
    <span className="pi-text">
      {text.slice(0, hlStart)}
      <mark className="pi-highlight">{text.slice(hlStart, hlEnd)}</mark>
      {text.slice(hlEnd)}
    </span>
  )
}
