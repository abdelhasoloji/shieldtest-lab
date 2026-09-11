import http2 from 'node:http2';

// Minimal loopback HTTP/2 (h2c) target used to VALIDATE the rapid-reset module
// end to end without touching any real host. It plays the victim and measures
// what a real protected origin would care about: how many streams were opened
// and how many were reset (RST_STREAM) mid-flight, plus the concurrent peak.
//
// Loopback only. This is a measurement fixture, not a server you expose.

export function createH2TestTarget(env = process.env) {
  const HOST = env.LISTEN_HOST || '127.0.0.1';
  const PORT = Number(env.LISTEN_PORT || 0); // 0 = ephemeral (tests read the real port)

  const stats = { streams: 0, resets: 0, responded: 0, concurrent: 0, concurrentPeak: 0 };
  let server = null;

  const onStream = (stream) => {
    stats.streams++;
    stats.concurrent++;
    stats.concurrentPeak = Math.max(stats.concurrentPeak, stats.concurrent);
    stream.on('close', () => {
      stats.concurrent--;
      if (stream.rstCode) stats.resets++;
    });
    stream.on('error', () => {});
    try {
      stream.respond({ ':status': 200 });
      stream.end('ok');
      stats.responded++;
    } catch {
      // Client reset before we could respond — that is exactly the shape we measure.
    }
  };

  return {
    stats,
    start() {
      return new Promise((resolve) => {
        server = http2.createServer();
        server.on('stream', onStream);
        server.on('error', () => {});
        server.listen(PORT, HOST, () => {
          const addr = server.address();
          console.log(JSON.stringify({ event: 'h2-test-target.ready', listen: `${HOST}:${addr.port}` }));
          resolve({ host: HOST, port: addr.port });
        });
      });
    },
    stop() {
      return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
    },
  };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  createH2TestTarget().start();
}
