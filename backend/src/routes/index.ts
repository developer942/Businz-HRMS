import { Router } from 'express';
import { healthRouter } from './healthRoutes.js';
import { authRouter } from './authRoutes.js';
import { employeeRouter } from './employeeRoutes.js';
import { attendanceRouter } from './attendanceRoutes.js';
import { leaveRouter } from './leaveRoutes.js';
import { shiftRouter } from './shiftRoutes.js';
import { trackingRouter } from './trackingRoutes.js';
import { settingsRouter } from './settingsRoutes.js';
import { payrollRouter } from './payrollRoutes.js';
import { salaryStructureRouter } from './salaryStructureRoutes.js';
import { overtimeRouter } from './overtimeRoutes.js';
import { rbacRouter } from './rbacRoutes.js';
import { aiRouter } from './aiRoutes.js';
import { customerRouter } from './customerRoutes.js';
import { whatsappRouter } from './whatsappRoutes.js';
import { expenseRouter } from './expenseRoutes.js';
import { crmRouter } from './crmRoutes.js';
import { pettyCashRouter } from './pettyCashRoutes.js';
import { departmentRouter } from './departmentRoutes.js';

export const apiRouter = Router();

// Health check available at /health and /api/v1/health
apiRouter.use(healthRouter);

// Domain Routes
apiRouter.use('/auth', authRouter);
apiRouter.use('/', salaryStructureRouter); // specific sub-routes for /employees/:id/salary-structure
apiRouter.use('/employees', employeeRouter);
apiRouter.use('/departments', departmentRouter);
apiRouter.use('/settings/departments', departmentRouter);
apiRouter.use('/attendance', attendanceRouter);
apiRouter.use('/leaves', leaveRouter);
apiRouter.use('/shifts', shiftRouter);
apiRouter.use('/tracking', trackingRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/payroll', payrollRouter);
apiRouter.use('/rbac', rbacRouter);
apiRouter.use('/settings/roles-permissions', rbacRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/', overtimeRouter);
apiRouter.use('/customers', customerRouter);
apiRouter.use('/whatsapp', whatsappRouter);
apiRouter.use('/expenses', expenseRouter);
apiRouter.use('/crm', crmRouter);
apiRouter.use('/petty-cash', pettyCashRouter);
