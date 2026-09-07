import http from 'node:http';
import { runScenario } from '../run-scenario.mjs';
import { SCENARIOS, scenarioNames } from '../scenarios.mjs';
import { PAGE } from './ui.mjs';

// Loopback-only control console for the closed lab.
//
// Safety by construction:
//   - it binds a LOOPBACK host only (127.0.0.1 / ::1 / localhost). A non-loopback
//     bind is refused unless LAB_CONSOLE_ALLOW_NONLOOPBACK=1 is set explicitly,
//     and even then it prints a loud warning — the lab must never be public;
//   - the only thing a client can ask for is a NAMED, allowlisted scenario. No
//     target, host, port, rate or duration is ever accepted from the wire, so the
//     console cannot be turned into a general-purpose traffic launcher;
//   - every scenario is bounded by the lab's hard caps, in-process over loopback.

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/** Public, non-secret description of a scenario for the UI. */
function describe(name) {
  const cfg = SCENARIOS[name];
  const gens = cfg.generators ?? (cfg.generator ? [cfg.generator] : []);
  const profiles = [...new Set(gens.map((g) => g.PROFILE ?? 'generic'))];
  return {
    name,
    summary: cfg.summary,
    useScrubber: !!cfg.useScrubber,
    strategy: cfg.useScrubber ? (cfg.scrubber?.STRATEGY ?? 'ceiling') : null,
    withLegit: !!cfg.withLegit,
    generators: gens.length,
    profiles,
  };
}

export function createConsole(env = process.env) {
  const HOST = env.LAB_CONSOLE_HOST || '127.0.0.1';
  const PORT = Number(env.LAB_CONSOLE_PORT || 9110);
  const allowNonLoopback = env.LAB_CONSOLE_ALLOW_NONLOOPBACK === '1';

  if (!LOOPBACK_HOSTS.has(HOST) && !allowNonLoopback) {
    throw new Error(
      `LAB_CONSOLE_HOST ${JSON.stringify(HOST)} is not a loopback address. The lab console must ` +
        `not be exposed off-host; set LAB_CONSOLE_ALLOW_NONLOOPBACK=1 only inside an isolated network.`,
    );
  }
  if (!LOOPBACK_HOSTS.has(HOST)) {
    console.warn(
      JSON.stringify({
        event: 'console.warn',
        message: 'binding a NON-loopback host — ensure this is an isolated lab network with no public route',
        host: HOST,
      }),
    );
  }

  let server = null;
  let busy = false; // one in-process scenario at a time

  function sendJson(res, code, body) {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  function handleRunStream(req, res, scenario) {
    if (!SCENARIOS[scenario]) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'unknown scenario' })}\n\n`);
      return res.end();
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    if (busy) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'a run is already in progress' })}\n\n`);
      return res.end();
    }
    busy = true;
    let closed = false;
    const write = (event, data) => {
      if (closed) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        closed = true;
      }
    };
    req.on('close', () => {
      closed = true;
    });
    runScenario(scenario, { onSample: (snap) => write('sample', snap) })
      .then((summary) => {
        write('done', summary);
      })
      .catch((err) => {
        write('error', { error: err.message });
      })
      .finally(() => {
        busy = false;
        if (!closed) res.end();
      });
  }

  async function handleRunPost(req, res) {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) return sendJson(res, 413, { error: 'body too large' });
    }
    let scenario = null;
    try {
      scenario = JSON.parse(body || '{}').scenario;
    } catch {
      return sendJson(res, 400, { error: 'invalid JSON' });
    }
    if (!scenario || !SCENARIOS[scenario]) {
      return sendJson(res, 400, { error: 'scenario must be one of the named scenarios' });
    }
    if (busy) return sendJson(res, 409, { error: 'a run is already in progress' });
    busy = true;
    try {
      const summary = await runScenario(scenario);
      sendJson(res, 200, summary);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    } finally {
      busy = false;
    }
  }

  function onRequest(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(PAGE);
    }
    if (req.method === 'GET' && path === '/api/health') {
      return sendJson(res, 200, { ok: true, scenarios: scenarioNames().length });
    }
    if (req.method === 'GET' && path === '/api/scenarios') {
      return sendJson(res, 200, scenarioNames().map(describe));
    }
    if (req.method === 'GET' && path === '/api/run-stream') {
      return handleRunStream(req, res, url.searchParams.get('scenario'));
    }
    if (req.method === 'POST' && path === '/api/run') {
      return handleRunPost(req, res);
    }
    sendJson(res, 404, { error: 'not found' });
  }

  function start(onReady) {
    server = http.createServer(onRequest);
    server.listen(PORT, HOST, () => {
      const addr = server.address();
      console.log(
        JSON.stringify({ event: 'console.ready', url: `http://${HOST}:${addr.port}` }),
      );
      if (onReady) onReady(addr.port);
    });
  }

  function stop(done) {
    if (server) server.close(() => done && done());
    else if (done) done();
  }

  return { start, stop };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const c = createConsole();
  c.start();
  const stop = () => c.stop(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
