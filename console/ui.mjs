// The lab console single-page UI, served inline by console/server.mjs.
//
// No external assets (fonts/scripts/styles) — the lab runs on an isolated
// network with no egress, so everything is self-contained. Vanilla JS only.

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ShieldTest Lab — Console</title>
<style>
  :root {
    --bg: #0e1116; --panel: #171c24; --panel2: #1e242e; --line: #2a313c;
    --ink: #e6edf3; --muted: #8b97a7; --accent: #4aa8ff; --ok: #3fb950;
    --warn: #d29922; --bad: #f85149; --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  header { padding: 18px 24px; border-bottom: 1px solid var(--line);
    display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
  header h1 { font-size: 18px; margin: 0; letter-spacing: .2px; }
  .banner { font-size: 12px; color: var(--warn); border: 1px solid var(--warn);
    border-radius: 999px; padding: 2px 10px; }
  main { max-width: 1080px; margin: 0 auto; padding: 24px; }
  .row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end; }
  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  select, button { font: inherit; }
  select { background: var(--panel2); color: var(--ink); border: 1px solid var(--line);
    border-radius: 8px; padding: 9px 12px; min-width: 280px; }
  button { background: var(--accent); color: #04121f; border: 0; border-radius: 8px;
    padding: 10px 18px; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  .scenario-summary { color: var(--muted); margin: 10px 0 0; min-height: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px; margin: 22px 0; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
  .card .k { font-size: 12px; color: var(--muted); }
  .card .v { font-size: 24px; font-weight: 650; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .card .v small { font-size: 13px; color: var(--muted); font-weight: 500; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
    padding: 16px; margin: 18px 0; }
  .panel h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .6px;
    color: var(--muted); margin: 0 0 12px; }
  svg { width: 100%; height: 90px; display: block; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 600; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  pre { background: var(--panel2); border: 1px solid var(--line); border-radius: 10px;
    padding: 14px; overflow-x: auto; font-family: var(--mono); font-size: 12.5px; margin: 0; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .badge.ok { background: rgba(63,185,80,.16); color: var(--ok); }
  .badge.warn { background: rgba(210,153,34,.16); color: var(--warn); }
  .badge.bad { background: rgba(248,81,73,.16); color: var(--bad); }
  .badge.muted { background: var(--panel2); color: var(--muted); }
  .hist { list-style: none; margin: 0; padding: 0; }
  .hist li { display: flex; justify-content: space-between; gap: 12px;
    padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  .hist li .name { font-weight: 600; }
  footer { color: var(--muted); font-size: 12px; padding: 20px 24px; border-top: 1px solid var(--line);
    max-width: 1080px; margin: 0 auto; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; }
</style>
</head>
<body>
<header>
  <h1>🛡️ ShieldTest Lab — Console</h1>
  <span class="banner" id="boundary">closed lab · loopback only · bounded scenarios</span>
</header>
<main>
  <div class="row">
    <div>
      <label for="scenario">Scenario</label>
      <select id="scenario"></select>
    </div>
    <button id="run">▶ Run scenario</button>
    <span id="status" class="badge muted">idle</span>
  </div>
  <p class="scenario-summary" id="summary"></p>

  <div class="grid" id="stats"></div>

  <div class="panel">
    <h2>Target packets / sec (live)</h2>
    <svg id="spark" viewBox="0 0 600 90" preserveAspectRatio="none"></svg>
  </div>

  <div class="panel" id="profilePanel" hidden>
    <h2>Per-synthetic-profile amplification</h2>
    <table id="profileTable"><thead><tr>
      <th>Profile</th><th class="n">Requests</th><th class="n">In bytes</th>
      <th class="n">Out packets</th><th class="n">Out bytes</th>
    </tr></thead><tbody></tbody></table>
  </div>

  <div class="panel" id="verdictPanel" hidden>
    <h2>Verdict artifact <span class="badge muted">class C · read-only</span></h2>
    <p id="verdictOutcome"></p>
    <pre id="verdict"></pre>
  </div>

  <div class="panel">
    <h2>Run history (this session)</h2>
    <ul class="hist" id="history"><li><span class="name">—</span><span>no runs yet</span></li></ul>
  </div>
</main>
<footer>
  This console only launches <strong>named, bounded</strong> scenarios over loopback inside the
  closed lab. It accepts no arbitrary target, host or rate. UDP amplification is
  <strong>class&nbsp;C</strong> (network bench) — its verdicts are read-only evidence and are never
  posted to ShieldTest's class-A/B validation endpoint.
</footer>
<script>
const $ = (id) => document.getElementById(id);
const fmt = (n) => (n == null ? '—' : (typeof n === 'number' ? n.toLocaleString() : n));
let running = false;
const series = [];

function setStatus(text, cls) { const s = $('status'); s.textContent = text; s.className = 'badge ' + cls; }

function statCards(snap) {
  const r = snap.reflector || {}, t = snap.target || {}, s = snap.scrubber;
  const cards = [
    ['Byte amplification', (r.bap ?? 0) + '×'],
    ['Packet amplification', (r.packetAmplification ?? 0) + '×'],
    ['Reflector requests', fmt(r.requests ?? 0)],
    ['Target packets/s', fmt(t.avgPps ?? 0)],
    ['Target kbit/s', fmt(Math.round((t.avgBps ?? 0) / 1000))],
  ];
  if (s) {
    cards.push(['Scrubber', s.mitigating ? '<span class="dot" style="background:var(--bad)"></span>mitigating'
      : '<span class="dot" style="background:var(--ok)"></span>passthrough']);
    cards.push(['Detection delay', s.detectionDelaySec == null ? '—' : s.detectionDelaySec + 's']);
    cards.push(['Collateral', (s.collateralPct ?? 0) + '%']);
    cards.push(['Dropped', fmt(s.dropped ?? 0)]);
  }
  $('stats').innerHTML = cards.map(([k, v]) =>
    '<div class="card"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>').join('');
}

function drawSpark() {
  const w = 600, h = 90, pad = 6;
  const max = Math.max(1, ...series);
  const pts = series.map((v, i) => {
    const x = series.length <= 1 ? 0 : (i / (series.length - 1)) * (w - 2 * pad) + pad;
    const y = h - pad - (v / max) * (h - 2 * pad);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  $('spark').innerHTML = series.length
    ? '<polyline fill="none" stroke="var(--accent)" stroke-width="2" points="' + pts + '"/>'
    : '';
}

function renderProfiles(perProfile) {
  const rows = Object.entries(perProfile || {});
  const panel = $('profilePanel');
  if (!rows.length) { panel.hidden = true; return; }
  panel.hidden = false;
  $('profileTable').querySelector('tbody').innerHTML = rows.map(([p, b]) =>
    '<tr><td>' + p + '</td><td class="n">' + fmt(b.requests) + '</td><td class="n">' + fmt(b.inputBytes) +
    '</td><td class="n">' + fmt(b.outputPackets) + '</td><td class="n">' + fmt(b.outputBytes) + '</td></tr>').join('');
}

function outcomeBadge(outcome) {
  const cls = outcome === 'MITIGATED' ? 'ok'
    : outcome === 'MITIGATED_WITH_COLLATERAL' ? 'warn'
    : outcome === 'NOT_MITIGATED' ? 'bad' : 'muted';
  return '<span class="badge ' + cls + '">' + outcome + '</span>';
}

function renderVerdict(v) {
  $('verdictPanel').hidden = false;
  $('verdictOutcome').innerHTML = 'Outcome: ' + outcomeBadge(v.outcome) +
    ' · amplification <strong>' + v.amplificationFactor + '×</strong>' +
    (v.mitigation ? ' · strategy <strong>' + v.mitigation.strategy + '</strong>' : '');
  $('verdict').textContent = JSON.stringify(v, null, 2);
}

function addHistory(v) {
  const li = document.createElement('li');
  li.innerHTML = '<span class="name">' + v.scenario + '</span>' +
    '<span>' + outcomeBadge(v.outcome) + ' · ' + v.amplificationFactor + '× · ' +
    new Date(v.generatedAt).toLocaleTimeString() + '</span>';
  const h = $('history');
  if (h.firstElementChild && h.firstElementChild.textContent.includes('no runs')) h.innerHTML = '';
  h.prepend(li);
}

async function loadScenarios() {
  const res = await fetch('./api/scenarios');
  const list = await res.json();
  $('scenario').innerHTML = list.map((s) =>
    '<option value="' + s.name + '">' + s.name + '</option>').join('');
  const byName = Object.fromEntries(list.map((s) => [s.name, s]));
  const show = () => { const s = byName[$('scenario').value]; $('summary').textContent = s ? s.summary : ''; };
  $('scenario').addEventListener('change', show); show();
}

function run() {
  if (running) return;
  running = true; series.length = 0;
  $('run').disabled = true; setStatus('running…', 'warn');
  $('verdictPanel').hidden = true; $('profilePanel').hidden = true; $('stats').innerHTML = ''; drawSpark();
  const name = $('scenario').value;
  const es = new EventSource('./api/run-stream?scenario=' + encodeURIComponent(name));
  es.addEventListener('sample', (e) => {
    const snap = JSON.parse(e.data);
    statCards(snap);
    series.push(snap.target ? (snap.target.avgPps || 0) : 0);
    if (series.length > 240) series.shift();
    drawSpark();
  });
  es.addEventListener('done', (e) => {
    const summary = JSON.parse(e.data);
    statCards(summary);
    renderProfiles(summary.perProfile);
    renderVerdict(summary.verdict);
    addHistory(summary.verdict);
    setStatus('done', 'ok');
    es.close(); running = false; $('run').disabled = false;
  });
  es.addEventListener('error', (e) => {
    setStatus('error', 'bad');
    if (e.data) { try { $('summary').textContent = JSON.parse(e.data).error; } catch {} }
    es.close(); running = false; $('run').disabled = false;
  });
}

$('run').addEventListener('click', run);
loadScenarios();
</script>
</body>
</html>`;
