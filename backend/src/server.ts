// MailSort Backend Server
// Local development with Express, deployable to Azure Functions

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { checkHealth, closePool, isDatabaseSqlite } from './db';
import { authMiddleware } from './middleware/auth';
import { aiRateLimiter, crudRateLimiter } from './middleware/rateLimiter';
import { logger } from './services/logger';
import tenantsRouter from './routes/tenants';
import rulesRouter from './routes/rules';
import categoriesRouter from './routes/categories';
import macrosRouter from './routes/macros';
import templatesRouter from './routes/templates';
import aiRouter from './routes/ai';
import processingRouter from './routes/processing';
import auditRouter from './routes/audit';
import actionsRouter from './routes/actions';
import integrationsRouter from './routes/integrations';
import todoSyncRouter from './routes/todoSync';
import betaSignupRouter from './routes/betaSignup';
import copilotRouter from './routes/copilot';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 7071;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '25mb' })); // Increased for email attachment forwarding (base64 PDFs)

// Request ID + logging middleware
app.use((req, _res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
  logger.info('request', {
    method: req.method,
    path: req.path,
    requestId: req.headers['x-request-id'],
  });
  next();
});

// Health check (no auth required)
app.get('/api/health', async (req, res) => {
  const dbHealthy = await checkHealth();
  const isSqliteFallback = isDatabaseSqlite() && process.env.DATABASE_URL && process.env.DATABASE_URL !== 'sqlite';
  res.json({
    status: dbHealthy ? (isSqliteFallback ? 'degraded' : 'healthy') : 'degraded',
    database: dbHealthy ? 'connected' : 'disconnected',
    engine: isDatabaseSqlite() ? 'sqlite' : 'postgresql',
    sqlite_fallback: isSqliteFallback || false,
    warning: isSqliteFallback ? 'PostgreSQL nicht erreichbar - SQLite Fallback aktiv! Daten sind nicht synchron.' : undefined,
    timestamp: new Date().toISOString(),
  });
});

// Public routes (no auth required)
app.use('/api/beta-signup', crudRateLimiter, betaSignupRouter);

// AI Routes (auth + rate limiting)
app.use('/api', authMiddleware, aiRateLimiter, aiRouter);

// API Routes (auth + rate limiting)
app.use('/api/tenants', authMiddleware, crudRateLimiter, tenantsRouter);
app.use('/api/rules', authMiddleware, crudRateLimiter, rulesRouter);
app.use('/api/categories', authMiddleware, crudRateLimiter, categoriesRouter);
app.use('/api/macros', authMiddleware, crudRateLimiter, macrosRouter);
app.use('/api/templates', authMiddleware, crudRateLimiter, templatesRouter);

// Processing Pipeline (auth + AI rate limiting)
app.use('/api', authMiddleware, aiRateLimiter, processingRouter);

// Audit, Actions, Integrations (auth + CRUD rate limiting)
app.use('/api/audit', authMiddleware, crudRateLimiter, auditRouter);
app.use('/api/actions', authMiddleware, crudRateLimiter, actionsRouter);
app.use('/api/integrations', authMiddleware, crudRateLimiter, integrationsRouter);
app.use('/api/todo', authMiddleware, crudRateLimiter, todoSyncRouter);

// Copilot premium feature: generate/fetch Context-Aware Drafts. Uses the AI
// rate limiter because the endpoint calls Azure OpenAI + Graph retrieval.
app.use('/api/copilot', authMiddleware, aiRateLimiter, copilotRouter);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.headers['x-request-id'],
    tenantId: req.tenantId,
  });
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
🚀 MailSort Backend running on http://localhost:${PORT}
📊 Health check: http://localhost:${PORT}/api/health
📝 API docs: http://localhost:${PORT}/api

Environment: ${process.env.NODE_ENV || 'development'}
  `);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down...');
  server.close();
  await closePool();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
