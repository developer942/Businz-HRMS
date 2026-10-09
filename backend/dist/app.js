import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { healthRouter } from './routes/healthRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
export const createApp = () => {
    const app = express();
    // Behind host nginx -> container nginx (private/loopback IPs). Trust only those hops so
    // req.ip is the real client IP and the rate limiter doesn't lump all users together.
    app.set('trust proxy', 'loopback, linklocal, uniquelocal');
    // 1. Security Headers via Helmet
    app.use(helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        hidePoweredBy: true,
        contentSecurityPolicy: false, // APIs return JSON; CSP disabled to prevent false positives on data fetches
    }));
    // 2. High-throughput payload compression
    app.use(compression());
    // 3. CORS Configuration
    app.use(cors({
        origin: (origin, callback) => {
            // Allow non-browser requests (mobile apps, curl, server-to-server)
            if (!origin)
                return callback(null, true);
            // In development, testing, or with wildcard: allow all. Also permit vercel.app and localhost origins
            if (env.NODE_ENV !== 'production' ||
                env.corsOriginsList.includes('*') ||
                env.corsOriginsList.includes(origin) ||
                origin.includes('localhost') ||
                origin.includes('127.0.0.1') ||
                origin.endsWith('.vercel.app')) {
                return callback(null, true);
            }
            return callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'x-user-role',
            'x-employee-id',
            'x-internal-benchmark',
        ],
    }));
    // 4. Request Body Parsing with size limits
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    // 5. Root health check endpoint (unlimited rate)
    app.use(healthRouter);
    // 6. General API routes with high-throughput rate limiter
    app.use('/api/v1', apiRateLimiter, apiRouter);
    // 7. 404 Not Found handler
    app.use((_req, res) => {
        res.status(404).json({
            success: false,
            error: {
                code: 'NOT_FOUND',
                message: 'The requested resource does not exist',
                details: [],
            },
        });
    });
    // 8. Global Error Handler
    app.use(errorHandler);
    return app;
};
export const app = createApp();
//# sourceMappingURL=app.js.map