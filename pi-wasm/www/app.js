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

  const display = digits > 500
    ? pi.slice(0, 102) + '\n[...省略中间...]\n' + pi.slice(-100)
    : pi;
  const out = document.getElementById('pi-out');
  out.textContent = display;
  out.style.display = 'block';
  document.getElementById('copy-btn').disabled = false;
}
