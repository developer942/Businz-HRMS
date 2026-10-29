import { Router } from 'express';
import { getAttendanceLogs, recordPunch, verifyFace, getTodaySummary, getShiftStatus, reportGpsDiagnostic, getGpsDiagnostics, } from '../controllers/attendanceController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
export const attendanceRouter = Router();
attendanceRouter.use(authenticateToken);
attendanceRouter.get('/', getAttendanceLogs);
attendanceRouter.get('/shift-status', getShiftStatus);
attendanceRouter.post('/punch', recordPunch);
attendanceRouter.post('/verify-face', verifyFace);
attendanceRouter.get('/summary', getTodaySummary);
attendanceRouter.post('/gps-diagnostics', reportGpsDiagnostic);
attendanceRouter.get('/gps-diagnostics', getGpsDiagnostics);
//# sourceMappingURL=attendanceRoutes.js.map