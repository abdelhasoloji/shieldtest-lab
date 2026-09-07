// The lab console single-page UI, served inline by console/server.mjs.
//
// No external assets (fonts/scripts/styles) — the lab runs on an isolated
// network with no egress, so everything is self-contained. Vanilla JS only.
// The look reuses the WEDOS ShieldTest app's design tokens (brand navy, amber
// accent, light+dark) so the lab console is visually of a piece with the app.

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ShieldTest Lab — Console</title>
<style>
  :root {
    --bg: #f5f6f8; --surface: #ffffff; --surface-2: #f0f2f5; --border: #e2e5ea;
    --text: #1a1d21; --muted: #6b7280;
    --brand: #003484; --brand-2: #002a6b; --accent: #f5a623;
    --primary: var(--brand); --primary-hover: var(--brand-2); --primary-contrast: #ffffff;
    --danger: #dc2626; --danger-bg: #fef2f2; --success: #16a34a; --success-bg: #ecfdf3;
    --warning: #d97706; --warning-bg: #fffbeb;
    --shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04);
    --radius: 10px;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
      --bg:#0f1115;--surface:#171a20;--surface-2:#1e222a;--border:#2a2f3a;--text:#e6e8eb;--muted:#9aa3af;
      --brand:#4f8fdb;--brand-2:#003484;--primary:var(--brand);--primary-hover:#7cabe6;
      --danger:#f87171;--danger-bg:#2a1414;--success:#4ade80;--success-bg:#12220f;
      --warning:#fbbf24;--warning-bg:#2a2010;--shadow:0 1px 3px rgba(0,0,0,.4);
    }
  }
  :root[data-theme='dark'] {
    --bg:#0f1115;--surface:#171a20;--surface-2:#1e222a;--border:#2a2f3a;--text:#e6e8eb;--muted:#9aa3af;
    --brand:#4f8fdb;--brand-2:#003484;--primary:var(--brand);--primary-hover:#7cabe6;
    --danger:#f87171;--danger-bg:#2a1414;--success:#4ade80;--success-bg:#12220f;
    --warning:#fbbf24;--warning-bg:#2a2010;--shadow:0 1px 3px rgba(0,0,0,.4);
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font);
    font-size: 15px; line-height: 1.5; }
  .accent-line { height: 4px; background: linear-gradient(90deg, var(--brand-2), var(--brand), var(--accent)); }
  .app { max-width: 1040px; margin: 0 auto; padding: 1rem 1.25rem 4rem; }
  .brandbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    flex-wrap: wrap; padding: 1rem 0 .75rem; border-bottom: 1px solid var(--border); margin-bottom: .75rem; }
  .brand-lockup { display: flex; align-items: center; gap: .7rem; }
  .brand-mark { height: 30px; width: 30px; border-radius: 7px; background: var(--brand); color: #fff;
    display: grid; place-items: center; font-size: 17px; }
  .brand-name { font-weight: 800; letter-spacing: -0.01em; }
  .brand-name span { color: var(--muted); font-weight: 600; }
  .brand-tag { font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
    color: var(--brand); border: 1px solid var(--brand); border-radius: 999px; padding: .18rem .55rem; }
  .theme-toggle { font: inherit; font-size: .8rem; cursor: pointer; background: var(--surface-2);
    color: var(--text); border: 1px solid var(--border); border-radius: 7px; padding: .35rem .6rem; }
  .header h1 { font-size: 1.5rem; margin: 0 0 .25rem; letter-spacing: -0.02em; }
  .subtitle { color: var(--muted); font-size: .9rem; margin: 0; }
  .subtitle code, .subtitle small code { font-family: var(--mono); background: var(--surface-2);
    padding: .1rem .35rem; border-radius: 5px; font-size: .85em; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 1.25rem; margin: 1.25rem 0; }
  .card h2 { font-size: 1.05rem; margin: 0 0 1rem; display: flex; align-items: center; gap: .5rem; }
  .runbar { display: flex; gap: .9rem; align-items: flex-end; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: .3rem; flex: 1; min-width: 260px; }
  .field label { font-size: .8rem; font-weight: 600; }
  select { font: inherit; padding: .5rem .6rem; border: 1px solid var(--border); border-radius: 7px;
    background: var(--surface); color: var(--text); width: 100%; }
  select:focus { outline: 2px solid var(--primary); outline-offset: -1px; border-color: var(--primary); }
  .scenario-summary { color: var(--muted); font-size: .85rem; margin: .7rem 0 0; min-height: 1.2em; }
  .scenario-meta { display: flex; gap: .4rem; flex-wrap: wrap; margin-top: .6rem; }
  .btn { font: inherit; font-weight: 600; cursor: pointer; border: 1px solid transparent; border-radius: 7px;
    padding: .5rem .9rem; background: var(--surface-2); color: var(--text); transition: background .12s, opacity .12s; }
  .btn:hover:not(:disabled) { background: var(--border); }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn-primary { background: var(--primary); color: var(--primary-contrast); border-color: var(--primary); }
  .btn-primary:hover:not(:disabled) { background: var(--primary-hover); border-color: var(--primary-hover); }
  .badge { font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
    padding: .2rem .5rem; border-radius: 999px; border: 1px solid transparent; white-space: nowrap; }
  .badge.brand { background: rgba(0,52,132,.1); color: var(--brand); border-color: var(--brand); }
  .badge.neutral { background: var(--surface-2); color: var(--muted); border-color: var(--border); }
  .badge.ok { background: var(--success-bg); color: var(--success); border-color: var(--success); }
  .badge.warn { background: var(--warning-bg); color: var(--warning); border-color: var(--warning); }
  .badge.bad { background: var(--danger-bg); color: var(--danger); border-color: var(--danger); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: .75rem; }
  .tile { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: .7rem .85rem; }
  .tile .k { font-size: .72rem; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
  .tile .v { font-family: var(--mono); font-size: 1.35rem; font-weight: 600; margin-top: .25rem;
    font-variant-numeric: tabular-nums; }
  .tile .v small { font-size: .8rem; color: var(--muted); font-weight: 500; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; }
  svg { width: 100%; height: 96px; display: block; }
  .chart-axis { font-family: var(--mono); font-size: 10px; fill: var(--muted); }
  table { width: 100%; border-collapse: collapse; font-size: .88rem; }
  th, td { text-align: left; padding: .5rem .55rem; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; font-size: .78rem; text-transform: uppercase; letter-spacing: .03em; }
  td.n, th.n { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
  pre { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: .9rem;
    overflow-x: auto; font-family: var(--mono); font-size: .78rem; line-height: 1.5; margin: 0; }
  .verdict-head { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; margin-bottom: .8rem; }
  .hist { list-style: none; margin: 0; padding: 0; }
  .hist li { display: flex; justify-content: space-between; gap: 1rem; padding: .55rem 0;
    border-bottom: 1px solid var(--border); font-size: .88rem; }
  .hist li:last-child { border-bottom: 0; }
  .hist .name { font-weight: 600; }
  .muted { color: var(--muted); }
  footer { color: var(--muted); font-size: .8rem; border-top: 1px solid var(--border);
    padding-top: 1rem; margin-top: 1.5rem; }
</style>
</head>
<body>
<div class="accent-line"></div>
<div class="app">
  <div class="brandbar">
    <div class="brand-lockup">
      <div class="brand-mark">🛡️</div>
      <div class="brand-name">WEDOS ShieldTest <span>Lab</span></div>
      <span class="brand-tag">Network Bench</span>
    </div>
    <button class="theme-toggle" id="theme">◐ Theme</button>
  </div>

  <div class="header">
    <h1>Lab Console</h1>
    <p class="subtitle">Launch a bounded synthetic scenario, watch it live, read its verdict. Runs in-process over <code>127.0.0.1</code> inside the closed lab.</p>
  </div>

  <div class="card">
    <h2>Run a scenario</h2>
    <div class="runbar">
      <div class="field">
        <label for="scenario">Scenario</label>
        <select id="scenario"></select>
      </div>
      <button class="btn btn-primary" id="run">▶ Run scenario</button>
      <span class="badge neutral" id="status">idle</span>
    </div>
    <p class="scenario-summary" id="summary"></p>
    <div class="scenario-meta" id="meta"></div>
  </div>

  <div class="card">
    <h2>Live telemetry</h2>
    <div class="tiles" id="tiles"></div>
    <div style="margin-top:1.1rem">
      <div class="k muted" style="font-size:.78rem;text-transform:uppercase;letter-spacing:.03em;margin-bottom:.3rem">Target packets / sec</div>
      <svg id="spark" viewBox="0 0 620 96" preserveAspectRatio="none" aria-label="Target packets per second"></svg>
    </div>
  </div>

  <div class="card" id="profileCard" hidden>
    <h2>Per-synthetic-profile amplification</h2>
    <table>
      <thead><tr><th>Profile</th><th class="n">Requests</th><th class="n">In bytes</th><th class="n">Out packets</th><th class="n">Out bytes</th></tr></thead>
      <tbody id="profileBody"></tbody>
    </table>
  </div>

  <div class="card" id="verdictCard" hidden>
    <h2>Verdict artifact <span class="badge neutral">class C · read-only</span></h2>
    <div class="verdict-head" id="verdictHead"></div>
    <pre id="verdict"></pre>
    <p class="muted" style="font-size:.8rem;margin:.8rem 0 0">UDP amplification is class C ("network bench"). ShieldTest's <code>/api/drs-validations</code> records class A/B only — this artifact is standalone, read-only evidence and is never posted there.</p>
  </div>

  <div class="card">
    <h2>Run history <span class="muted" style="font-weight:400;font-size:.85rem">(this session)</span></h2>
    <ul class="hist" id="history"><li><span class="name">—</span><span class="muted">no runs yet</span></li></ul>
  </div>

  <footer>
    This console only launches <strong>named, bounded</strong> scenarios over loopback inside the closed
    lab. It accepts no arbitrary target, host, port or rate — so it cannot become a general-purpose
    traffic launcher.
  </footer>
</div>
<script>
const $ = (id) => document.getElementById(id);
const fmt = (n) => (n == null ? '—' : (typeof n === 'number' ? Math.round(n).toLocaleString() : n));
let running = false, series = [], scenarios = {};

const themes = ['system', 'light', 'dark']; let ti = 0;
$('theme').addEventListener('click', () => {
  ti = (ti + 1) % 3; const t = themes[ti];
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  $('theme').textContent = '◐ ' + t[0].toUpperCase() + t.slice(1);
});

function setStatus(text, cls) { const s = $('status'); s.textContent = text; s.className = 'badge ' + cls; }

function renderMeta(s) {
  if (!s) { $('meta').innerHTML = ''; return; }
  const chips = ['<span class="badge neutral">' + s.generators + (s.generators > 1 ? ' generators' : ' generator') + '</span>',
    '<span class="badge brand">' + s.profiles.join(' · ') + '</span>',
    s.useScrubber ? '<span class="badge neutral">scrubber: ' + s.strategy + '</span>' : '<span class="badge neutral">no scrubber</span>'];
  if (s.withLegit) chips.push('<span class="badge neutral">+ benign traffic</span>');
  $('meta').innerHTML = chips.join('');
}

function tiles(snap) {
  const r = snap.reflector || {}, t = snap.target || {}, s = snap.scrubber;
  const cards = [
    ['Byte amplification', (r.bap ?? 0) + '×'],
    ['Packet amplification', (r.packetAmplification ?? 0) + '×'],
    ['Reflector requests', fmt(r.requests ?? 0)],
    ['Target packets/s', fmt(t.avgPps ?? 0)],
    ['Target kbit/s', fmt(Math.round((t.avgBps ?? 0) / 1000))],
  ];
  if (s) {
    cards.push(['Scrubber', s.mitigating
      ? '<span class="dot" style="background:var(--danger)"></span>mitigating'
      : '<span class="dot" style="background:var(--success)"></span>passthrough']);
    cards.push(['Detection', s.detectionDelaySec == null ? '—' : s.detectionDelaySec + '<small> s</small>']);
    cards.push(['Collateral', (s.collateralPct ?? 0) + '<small> %</small>']);
    cards.push(['Dropped', fmt(s.dropped ?? 0)]);
  }
  $('tiles').innerHTML = cards.map(([k, v]) =>
    '<div class="tile"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>').join('');
}

function drawSpark() {
  const w = 620, h = 96, pad = 8, max = Math.max(1, ...series);
  if (!series.length) { $('spark').innerHTML = ''; return; }
  const pts = series.map((v, i) => {
    const x = series.length <= 1 ? pad : (i / (series.length - 1)) * (w - 2 * pad) + pad;
    const y = h - pad - (v / max) * (h - 2 * pad);
    return [x, y];
  });
  const line = pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = 'M' + pad + ',' + (h - pad) + ' L' + line.replace(/ /g, ' L') + ' L' + pts.at(-1)[0].toFixed(1) + ',' + (h - pad) + ' Z';
  const end = pts.at(-1);
  $('spark').innerHTML =
    '<path d="' + area + '" fill="var(--brand)" fill-opacity="0.12"/>' +
    '<polyline fill="none" stroke="var(--brand)" stroke-width="2" points="' + line + '"/>' +
    '<circle cx="' + end[0].toFixed(1) + '" cy="' + end[1].toFixed(1) + '" r="3.5" fill="var(--accent)"/>' +
    '<text class="chart-axis" x="' + (w - 4) + '" y="12" text-anchor="end">peak ' + fmt(max) + '</text>';
}

function renderProfiles(perProfile) {
  const rows = Object.entries(perProfile || {});
  if (rows.length < 2) { $('profileCard').hidden = true; return; }
  $('profileCard').hidden = false;
  $('profileBody').innerHTML = rows.map(([p, b]) =>
    '<tr><td>' + p + '</td><td class="n">' + fmt(b.requests) + '</td><td class="n">' + fmt(b.inputBytes) +
    '</td><td class="n">' + fmt(b.outputPackets) + '</td><td class="n">' + fmt(b.outputBytes) + '</td></tr>').join('');
}

function outcomeBadge(o) {
  const cls = o === 'MITIGATED' ? 'ok' : o === 'MITIGATED_WITH_COLLATERAL' ? 'warn'
    : o === 'NOT_MITIGATED' ? 'bad' : 'neutral';
  return '<span class="badge ' + cls + '">' + o + '</span>';
}

function renderVerdict(v) {
  $('verdictCard').hidden = false;
  $('verdictHead').innerHTML = 'Outcome: ' + outcomeBadge(v.outcome) +
    ' <span class="muted">·</span> amplification <strong>' + v.amplificationFactor + '×</strong>' +
    (v.mitigation ? ' <span class="muted">·</span> strategy <strong>' + v.mitigation.strategy + '</strong>' : '');
  $('verdict').textContent = JSON.stringify(v, null, 2);
}

function addHistory(v) {
  const h = $('history');
  if (h.firstElementChild && h.firstElementChild.textContent.includes('no runs')) h.innerHTML = '';
  const li = document.createElement('li');
  li.innerHTML = '<span class="name">' + v.scenario + '</span><span>' + outcomeBadge(v.outcome) +
    ' <span class="muted">' + v.amplificationFactor + '× · ' + new Date(v.generatedAt).toLocaleTimeString() + '</span></span>';
  h.prepend(li);
}

function run() {
  if (running) return;
  running = true; series = [];
  $('run').disabled = true; setStatus('running…', 'warn');
  $('verdictCard').hidden = true; $('profileCard').hidden = true;
  tiles({}); drawSpark();
  const name = $('scenario').value;
  const es = new EventSource('./api/run-stream?scenario=' + encodeURIComponent(name));
  es.addEventListener('sample', (e) => {
    const snap = JSON.parse(e.data);
    tiles(snap);
    series.push(snap.target ? (snap.target.avgPps || 0) : 0);
    if (series.length > 240) series.shift();
    drawSpark();
  });
  es.addEventListener('done', (e) => {
    const summary = JSON.parse(e.data);
    tiles(summary); renderProfiles(summary.perProfile); renderVerdict(summary.verdict); addHistory(summary.verdict);
    setStatus('done', 'ok'); es.close(); running = false; $('run').disabled = false;
  });
  es.addEventListener('error', (e) => {
    setStatus('error', 'bad');
    if (e.data) { try { $('summary').textContent = JSON.parse(e.data).error; } catch (_) {} }
    es.close(); running = false; $('run').disabled = false;
  });
}

async function init() {
  const list = await (await fetch('./api/scenarios')).json();
  scenarios = Object.fromEntries(list.map((s) => [s.name, s]));
  $('scenario').innerHTML = list.map((s) => '<option value="' + s.name + '">' + s.name + '</option>').join('');
  const show = () => { const s = scenarios[$('scenario').value]; $('summary').textContent = s ? s.summary : ''; renderMeta(s); };
  $('scenario').addEventListener('change', show); show();
  tiles({});
}
$('run').addEventListener('click', run);
init();
</script>
</body>
</html>`;
