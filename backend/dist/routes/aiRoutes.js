import { Router } from 'express';
import { getAiStatus, listModels, generateAiContent, saveAiConfig, getEmployeeVerifiedContext, executeVerifiedHrmsQuery, } from '../controllers/aiController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles, scopeDataAccess } from '../middleware/rbacMiddleware.js';
export const aiRouter = Router();
aiRouter.use(authenticateToken);
aiRouter.get('/status', getAiStatus);
aiRouter.post('/models', requireRoles(['Super Admin', 'CEO', 'Admin', 'HR Admin']), listModels);
aiRouter.post('/generate', generateAiContent);
aiRouter.post('/config', requireRoles(['Super Admin', 'CEO', 'Admin', 'HR Admin']), saveAiConfig);
aiRouter.post('/query', scopeDataAccess, executeVerifiedHrmsQuery);
// Authenticated verified database context endpoint for chatbot
aiRouter.get('/employee-context', scopeDataAccess, getEmployeeVerifiedContext);
aiRouter.post('/employee-context', scopeDataAccess, getEmployeeVerifiedContext);
//# sourceMappingURL=aiRoutes.js.map