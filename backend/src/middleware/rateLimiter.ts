import rateLimit from 'express-rate-limit';
import { Request } from 'express';

/**
 * Rate limiter for AI endpoints - 60 requests per minute per tenant.
 * Uses tenant ID from auth middleware as key.
 */
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  keyGenerator: (req: Request) => req.tenantId || req.ip || 'unknown',
  message: {
    error: 'Too many AI requests. Please wait a moment.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for CRUD endpoints - 200 requests per minute per tenant.
 */
export const crudRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  keyGenerator: (req: Request) => req.tenantId || req.ip || 'unknown',
  message: {
    error: 'Too many requests. Please wait a moment.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});
