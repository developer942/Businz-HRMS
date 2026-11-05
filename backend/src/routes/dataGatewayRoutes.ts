import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { proxyDataGatewayRequest } from '../controllers/dataGatewayController.js';

export const dataGatewayRouter = Router();

dataGatewayRouter.use(authenticateToken);
dataGatewayRouter.post('/proxy', proxyDataGatewayRequest);

