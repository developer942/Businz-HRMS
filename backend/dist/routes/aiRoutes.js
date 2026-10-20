import { Router } from 'express';
import { getAiStatus, listModels, generateAiContent, saveAiConfig, getEmployeeVerifiedContext, } from '../controllers/aiController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
export const aiRouter = Router();
// Public/semi-public routes for client UI
aiRouter.get('/status', getAiStatus);
aiRouter.post('/models', listModels);
aiRouter.post('/generate', generateAiContent);
aiRouter.post('/config', saveAiConfig);
// Authenticated verified database context endpoint for chatbot
aiRouter.get('/employee-context', authenticateToken, getEmployeeVerifiedContext);
aiRouter.post('/employee-context', authenticateToken, getEmployeeVerifiedContext);
//# sourceMappingURL=aiRoutes.js.map