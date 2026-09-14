// SPOOFED LAB MODE console panel — a PURE renderer.
//
// Every dynamic value is HTML-escaped (the string equivalent of textContent), so
// no value is ever interpolated as markup. The panel is read-only: it displays
// state and offers a single permanent kill-switch action — it NEVER lets the
// operator type an IP, CIDR or interface (those come only from registered
// objects). Kept framework-free and testable in Node.

/** HTML-escape a value so it can never inject markup (textContent equivalent). */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Normalise raw state (typically derived from a verdict + live counters) into
 *  the panel's view model. Pure. */
export function spoofPanelModel(state = {}) {
  const locks = state.locks ?? {};
  const limits = state.limits ?? {};
  return {
    active: state.active === true,
    locks: {
      config: locks.config === true,
      confinement: locks.confinement === 'GO' ? 'GO' : locks.confinement === 'NO_GO' ? 'NO_GO' : 'PENDING',
      egress: locks.egress === true,
    },
    certificate: state.certificate
      ? { decision: state.certificate.decision ?? 'PENDING', timestamp: state.certificate.timestamp ?? null }
      : null,
    sourcePool: state.sourcePool ?? null,
    target: { id: state.target?.id ?? null, ip: state.target?.ip ?? null },
    limits: {
      requested: limits.requested ?? {},
      absolute: limits.absolute ?? {},
    },
    countdownSec: Number.isFinite(state.countdownSec) ? Math.max(0, Math.floor(state.countdownSec)) : null,
    droppedPackets: Number.isFinite(state.droppedPackets) ? state.droppedPackets : 0,
    lastStopReason: state.lastStopReason ?? null,
  };
}

const lockDot = (ok) => (ok ? '🟢' : '🔴');

/** Render the panel as a safe HTML string (all dynamic values escaped). */
export function renderSpoofPanelHtml(state = {}) {
  const m = spoofPanelModel(state);
  const req = m.limits.requested;
  const abs = m.limits.absolute;
  const limitRow = (label, r, a) =>
    `<tr><th>${esc(label)}</th><td>${esc(r ?? '—')}</td><td>${esc(a ?? '—')}</td></tr>`;

  return [
    '<section class="spoof-panel" aria-label="Spoofed lab mode">',
    `  <div class="spoof-badge" role="status">SPOOFED LAB MODE${m.active ? ' — ACTIVE' : ''}</div>`,
    '  <ul class="spoof-locks">',
    `    <li>${lockDot(m.locks.config)} Lock 1 — configuration</li>`,
    `    <li>${m.locks.confinement === 'GO' ? '🟢' : '🔴'} Lock 2 — confinement: ${esc(m.locks.confinement)}</li>`,
    `    <li>${lockDot(m.locks.egress)} Lock 3 — egress guard</li>`,
    '  </ul>',
    m.certificate
      ? `  <p class="spoof-cert">Confinement certificate: <b>${esc(m.certificate.decision)}</b> <span class="muted">${esc(m.certificate.timestamp ?? '')}</span></p>`
      : '  <p class="spoof-cert muted">No confinement certificate yet.</p>',
    `  <p class="spoof-pool">Source pool: <code>${esc(m.sourcePool ?? '—')}</code></p>`,
    `  <p class="spoof-target">Resolved target: <code>${esc(m.target.id ?? '—')}</code> → <code>${esc(m.target.ip ?? '—')}</code></p>`,
    '  <table class="spoof-limits"><thead><tr><th></th><th>requested</th><th>absolute</th></tr></thead><tbody>',
    limitRow('PPS', req.pps, abs.pps),
    limitRow('Duration (s)', req.durationSec, abs.durationSec),
    limitRow('Packet size', req.packetSize, abs.packetSize),
    '  </tbody></table>',
    `  <p class="spoof-countdown">Time remaining: <b>${m.countdownSec === null ? '—' : esc(m.countdownSec) + 's'}</b></p>`,
    `  <p class="spoof-dropped">Dropped by egress guard: <b>${esc(m.droppedPackets)}</b></p>`,
    m.lastStopReason
      ? `  <p class="spoof-stop">Last stop reason: <b>${esc(m.lastStopReason)}</b></p>`
      : '',
    '  <button type="button" class="spoof-kill" data-action="kill-spoof">■ KILL SWITCH</button>',
    '</section>',
  ]
    .filter(Boolean)
    .join('\n');
}
