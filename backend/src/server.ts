// PostPilot Backend Server
// Local development with Express, deployable to Azure Functions

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { checkHealth, closePool } from './db';
import { authMiddleware } from './middleware/auth';
import tenantsRouter from './routes/tenants';
import rulesRouter from './routes/rules';
import categoriesRouter from './routes/categories';
import macrosRouter from './routes/macros';
import templatesRouter from './routes/templates';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 7071;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Health check (no auth required)
app.get('/api/health', async (req, res) => {
  const dbHealthy = await checkHealth();
  res.json({
    status: dbHealthy ? 'healthy' : 'degraded',
    database: dbHealthy ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// API Routes (auth required)
app.use('/api/tenants', authMiddleware, tenantsRouter);
app.use('/api/rules', authMiddleware, rulesRouter);
app.use('/api/categories', authMiddleware, categoriesRouter);
app.use('/api/macros', authMiddleware, macrosRouter);
app.use('/api/templates', authMiddleware, templatesRouter);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
🚀 PostPilot Backend running on http://localhost:${PORT}
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
