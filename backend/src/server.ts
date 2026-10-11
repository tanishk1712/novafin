import 'dotenv/config';
import { createApp } from './app';
import { loadConfig } from './config';
import { marketService } from './services/market.service';
import { sessionService } from './services/session.service';

const config = loadConfig();
const app = createApp(config);

marketService.start(config.marketTickMs);
sessionService.startCleanup(60_000);

const server = app.listen(config.port, () => {
  console.log(
    `[novafin] SIMULATED demo API listening on http://localhost:${config.port}/api ` +
      `(market tick ${config.marketTickMs}ms, session TTL ${config.sessionTtlMinutes}min, CORS ${config.corsOrigins.join(', ')})`,
  );
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[novafin] ${signal} received, shutting down...`);
  marketService.stop();
  sessionService.stopCleanup();
  server.close((err) => {
    if (err) {
      console.error('[novafin] error during shutdown', err);
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
