import net from 'node:net';
import http from 'node:http';

// Instrumented TCP victim for the closed ShieldTest lab. It models the
// state-table / accept-queue pressure of a TCP connection flood WITHOUT any
// spoofing: connections come from real lab-CIDR sources. Beyond CAPACITY
// concurrent connections the target sheds new ones (models a full state table),
// so detection/mitigation of connection-exhaustion can be measured.
//
// `createTcpTarget()` builds an instance without side effects for tests; the
// module self-starts when run directly.

export function createTcpTarget(env = process.env) {
  const HOST = env.LISTEN_HOST || '0.0.0.0';
  const PORT = Number(env.LISTEN_PORT || 9003);
  const METRICS_PORT = Number(env.METRICS_PORT || 0);
  const CAPACITY = Number(env.CAPACITY || 200); // max concurrent connections the state table holds

  if (!Number.isFinite(CAPACITY) || CAPACITY < 1 || CAPACITY > 100000) {
    throw new Error('CAPACITY must be between 1 and 100000');
  }

  let accepted = 0;
  let refused = 0;
  let concurrent = 0;
  let concurrentPeak = 0;
  const startedAt = Date.now();
  const open = new Set();
  let metricsServer = null;

  const server = net.createServer((socket) => {
    if (concurrent >= CAPACITY) {
      // State table full → shed the new connection (measured as refused).
      refused++;
      socket.destroy();
      return;
    }
    accepted++;
    concurrent++;
    if (concurrent > concurrentPeak) concurrentPeak = concurrent;
    open.add(socket);
    const done = () => {
      if (open.delete(socket)) concurrent--;
    };
    socket.on('close', done);
    socket.on('error', done);
    socket.on('data', () => {}); // drain; the generator holds connections idle
  });

  const metrics = {
    get accepted() {
      return accepted;
    },
    get refused() {
      return refused;
    },
    get concurrentPeak() {
      return concurrentPeak;
    },
    get capacity() {
      return CAPACITY;
    },
    /** Share of offered connections shed once the state table was full. */
    get saturationPct() {
      const offered = accepted + refused;
      return offered > 0 ? Number(((refused / offered) * 100).toFixed(2)) : 0;
    },
    get avgCps() {
      const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
      return Number(((accepted + refused) / elapsed).toFixed(2));
    },
  };

  function renderMetrics() {
    return [
      '# HELP shieldtest_tcp_target_accepted_total Connections accepted by the lab TCP target.',
      '# TYPE shieldtest_tcp_target_accepted_total counter',
      `shieldtest_tcp_target_accepted_total ${accepted}`,
      '# HELP shieldtest_tcp_target_refused_total Connections shed once the state table was full.',
      '# TYPE shieldtest_tcp_target_refused_total counter',
      `shieldtest_tcp_target_refused_total ${refused}`,
      '# HELP shieldtest_tcp_target_concurrent_peak Peak concurrent connections held.',
      '# TYPE shieldtest_tcp_target_concurrent_peak gauge',
      `shieldtest_tcp_target_concurrent_peak ${concurrentPeak}`,
      '# HELP shieldtest_tcp_target_saturation_pct Share of offered connections shed (state-table pressure).',
      '# TYPE shieldtest_tcp_target_saturation_pct gauge',
      `shieldtest_tcp_target_saturation_pct ${metrics.saturationPct}`,
      '',
    ].join('\n');
  }

  function start(onReady) {
    server.listen(PORT, HOST, () => {
      const port = server.address().port;
      console.log(JSON.stringify({ event: 'tcp-target.ready', listen: `${HOST}:${port}`, capacity: CAPACITY }));
      if (METRICS_PORT > 0) {
        metricsServer = http.createServer((req, res) => {
          if ((req.url || '').split('?')[0] === '/metrics') {
            res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
            res.end(renderMetrics());
          } else {
            res.writeHead(404);
            res.end();
          }
        });
        metricsServer.listen(METRICS_PORT, HOST);
      }
      if (onReady) onReady(port);
    });
  }

  function stop(done) {
    for (const s of open) s.destroy();
    open.clear();
    let pending = 1 + (metricsServer ? 1 : 0);
    const settle = () => {
      pending--;
      if (pending <= 0 && done) done();
    };
    server.close(settle);
    if (metricsServer) metricsServer.close(settle);
  }

  return { start, stop, metrics, renderMetrics };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const t = createTcpTarget();
  t.start();
  const stop = () => t.stop(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
