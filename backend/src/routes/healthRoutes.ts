import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../services/databaseHealthService.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'Businz Enterprise HRMS Engine',
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/health/ready', async (_req: Request, res: Response) => {
  const database = await checkDatabaseHealth();
  const ready = database.configured && database.postgres.connected && database.databaseRest.connected;
  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'ready' : 'degraded',
    database,
    timestamp: new Date().toISOString(),
  });
});
