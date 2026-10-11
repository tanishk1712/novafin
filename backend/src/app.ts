import express, { type Express } from 'express';
import cors from 'cors';
import { loadConfig, type AppConfig } from './config';
import { createApiRouter } from './routes';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { requestLogger } from './middleware/request-logger';
import { sessionService } from './services/session.service';

/**
 * Builds the NovaFin demo API. Pure factory: never listens and never starts timers,
 * so it can be used directly by supertest.
 */
export function createApp(config: AppConfig = loadConfig()): Express {
  sessionService.configure({ ttlMinutes: config.sessionTtlMinutes });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use((_req, res, next) => {
    res.setHeader('X-NovaFin-Demo', 'simulated');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    cors({
      origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['X-NovaFin-Demo'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger);

  app.get('/', (_req, res) => {
    res.json({ success: true, data: { name: 'NovaFin demo API', docs: '/api/health', simulated: true } });
  });
  app.use('/api', createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
