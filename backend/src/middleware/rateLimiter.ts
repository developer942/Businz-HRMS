import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Strict rate limiter for authentication endpoints to prevent brute-force attacks.
 * Allows max 20 login attempts per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
      details: [],
    },
  },
  skip: (req) =>
    req.headers['x-enforce-rate-limit-test'] !== 'true' &&
    (env.NODE_ENV === 'test' || process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'),
});

/**
 * Strict rate limiter for credential dispatch to prevent email flooding or abuse.
 * Allows max 10 dispatch requests per 15 minutes per IP.
 */
export const credentialDispatchRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many credential dispatch requests. Please try again after 15 minutes.',
      details: [],
    },
  },
  skip: (req) =>
    req.headers['x-enforce-rate-limit-test'] !== 'true' &&
    (env.NODE_ENV === 'test' || process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'),
});

/**
 * Dedicated rate limiter for AI OCR visiting card scanning to prevent Gemini API quota exhaustion.
 * Allows max 10 OCR scan requests per 15 minutes per authenticated user / IP.
 */
export const ocrRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id || (req as any).user?.employeeId;
    return userId ? `ocr-user:${userId}` : `ocr-ip:${req.ip || 'unknown'}`;
  },
  validate: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many OCR card scan requests. Please wait a few minutes before scanning again.',
      details: [],
    },
  },
  skip: (req) =>
    req.headers['x-enforce-rate-limit-test'] !== 'true' &&
    (env.NODE_ENV === 'test' || process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'),
});

/**
 * High-capacity rate limiter for general API endpoints.
 * Allows high throughput (configured for >= 100 req/s load test capacity).
 */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded. Please throttle your request rate.',
      details: [],
    },
  },
  skip: (req) => {
    // Skip in automated test environments unless explicitly testing rate limits
    if (
      req.headers['x-enforce-rate-limit-test'] !== 'true' &&
      (env.NODE_ENV === 'test' || process.env.NODE_ENV === 'test' || process.env.VITEST === 'true')
    ) {
      return true;
    }
    // Header bypass strictly allowed ONLY in local development
    if (env.NODE_ENV === 'development' && req.headers['x-internal-benchmark'] === 'vrm-benchmark-2026') return true;
    return false;
  },
});
